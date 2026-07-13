import asyncio
import base64
import tempfile
import unittest
from pathlib import Path

from google.genai import interactions

from video_generation.adapters.google_omni import GoogleOmniVideoAdapter
from video_generation.adapters.types import VideoCreateRequest, VideoInputAsset, VideoQueryRequest
from video_generation.providers.google_omni_provider import VideoCreateDiagnostics
from video_generation.schemas import VideoGenerateRequest


PNG = b"\x89PNG\r\n\x1a\nmock-image"
MP4 = b"\x00\x00\x00\x18ftypmp42mock-video"


def run(coro):
    return asyncio.run(coro)


class FakeProvider:
    def __init__(self, response, diagnostics=None):
        self.response = response
        self.last_diagnostics = diagnostics
        self.requests = []

    def create_interaction(self, request):
        self.requests.append(request)
        return self.response


class UnsafeAdapterError(Exception):
    def __init__(self, status_code=None):
        super().__init__("unsafe body https://secret.invalid token=private")
        self.status_code = status_code


class ThrowingProvider:
    def __init__(self, error):
        self.error = error
        self.calls = 0

    def create_interaction(self, _request):
        self.calls += 1
        raise self.error


class GoogleOmniAdapterTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project = Path(self.temp_dir.name)
        (self.project / "input").mkdir()
        (self.project / "input" / "frame.png").write_bytes(PNG)

    def tearDown(self):
        self.temp_dir.cleanup()

    def request(self, mode="text-to-video", prompt="Create a video", inputs=None, duration="5s"):
        return VideoCreateRequest(
            provider="google_omni",
            model="gemini-omni-flash-preview",
            task_type=mode,
            prompt=prompt,
            params={"aspectRatio": "16:9", "duration": duration},
            inputs=inputs or {},
            project_dir=str(self.project),
        )

    def test_generate_request_maps_duration_and_first_frame_to_internal_request(self):
        adapter = GoogleOmniVideoAdapter(FakeProvider(None))
        request = VideoGenerateRequest(
            projectPath=str(self.project),
            provider="google_omni",
            model="gemini-omni-flash-preview",
            videoMode="image-to-video",
            prompt="Animate",
            aspectRatio="16:9",
            duration="6s",
            images=["input/frame.png"],
        )
        internal = adapter.create_request_from_generate_request(request)
        self.assertEqual(internal.params, {"aspectRatio": "16:9", "duration": "6s"})
        self.assertEqual(list(internal.inputs), ["image:firstFrame"])
        self.assertEqual(internal.inputs["image:firstFrame"][0].role, "first_frame")

    def test_typed_i2v_payload_maps_first_frame_and_only_allowed_fields(self):
        adapter = GoogleOmniVideoAdapter(FakeProvider(None))
        request = self.request(
            mode="image-to-video",
            prompt="Animate @image_1",
            inputs={
                "image:firstFrame": [
                    VideoInputAsset(kind="image", role="first_frame", path="input/frame.png")
                ]
            },
        )
        payload = adapter.build_create_payload(request, {})
        data = payload.model_dump(exclude_none=True)

        self.assertEqual(data["generation_config"]["video_config"]["task"], "image_to_video")
        self.assertEqual(data["response_format"], {"type": "video", "delivery": "inline", "aspect_ratio": "16:9"})
        self.assertFalse(data["background"])
        self.assertFalse(data["store"])
        self.assertFalse(data["stream"])
        self.assertIn("<FIRST_FRAME>", data["input"][0]["text"])
        self.assertEqual(data["input"][0]["text"].count("Generate a single video approximately 5 seconds long."), 1)
        self.assertNotIn("@image_1", data["input"][0]["text"])
        self.assertEqual(data["input"][1]["type"], "image")
        self.assertNotIn("previous_interaction_id", data)
        self.assertNotIn("resolution", str(data))
        self.assertNotIn("duration", data["response_format"])
        self.assertNotIn("duration", data["generation_config"]["video_config"])

    def test_reference_mode_accepts_ten_and_rejects_unknown_prompt_reference(self):
        image = "data:image/png;base64," + base64.b64encode(PNG).decode()
        assets = [VideoInputAsset(kind="image", role="reference", url=image) for _ in range(10)]
        adapter = GoogleOmniVideoAdapter(FakeProvider(None))
        payload = adapter.build_create_payload(
            self.request("reference-video", "Use @image_1 and @image_10", {"image:references": assets}),
            {},
        )
        text = payload.model_dump(exclude_none=True)["input"][0]["text"]
        self.assertIn("<IMAGE_REF_0>", text)
        self.assertIn("<IMAGE_REF_9>", text)
        self.assertEqual(text.count("Generate a single video approximately 5 seconds long."), 1)
        self.assertEqual(len(payload.input), 11)

        with self.assertRaisesRegex(ValueError, "Unknown Google Omni image reference"):
            adapter.build_create_payload(
                self.request("reference-video", "Use @image_11", {"image:references": assets}),
                {},
            )

    def test_duration_guidance_is_validated_and_rebuilt_once_for_all_modes(self):
        adapter = GoogleOmniVideoAdapter(FakeProvider(None))
        image = "data:image/png;base64," + base64.b64encode(PNG).decode()
        requests = (
            self.request("text-to-video", duration="3s"),
            self.request(
                "image-to-video",
                inputs={"image:firstFrame": [VideoInputAsset(kind="image", role="first_frame", url=image)]},
                duration="5s",
            ),
            self.request(
                "reference-video",
                inputs={"image:references": [VideoInputAsset(kind="image", role="reference", url=image)]},
                duration="10s",
            ),
        )
        for request, seconds in zip(requests, (3, 5, 10), strict=True):
            with self.subTest(mode=request.task_type, seconds=seconds):
                payload = adapter.build_create_payload(request, {})
                prompt = payload.model_dump(exclude_none=True)["input"][0]["text"]
                guidance = f"Generate a single video approximately {seconds} seconds long."
                self.assertEqual(prompt.count(guidance), 1)

        stale = self.request(
            prompt="Create a video.\n\nGenerate a single video approximately 3 seconds long.",
            duration="7s",
        )
        prompt = adapter.build_create_payload(stale, {}).model_dump(exclude_none=True)["input"][0]["text"]
        self.assertNotIn("approximately 3 seconds", prompt)
        self.assertEqual(prompt.count("Generate a single video approximately 7 seconds long."), 1)

        for invalid in ("2s", "11s", "", "5.5s", "abc", None):
            with self.subTest(duration=invalid), self.assertRaisesRegex(ValueError, "integer from 3s to 10s"):
                adapter.build_create_payload(self.request(duration=invalid), {})

    def test_remote_and_outside_project_images_are_rejected(self):
        adapter = GoogleOmniVideoAdapter(FakeProvider(None))
        for value in ("https://example.test/frame.png", str(self.project.parent / "outside.png")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                adapter.build_create_payload(
                    self.request(
                        "image-to-video",
                        "Animate",
                        {"image:firstFrame": [VideoInputAsset(kind="image", role="first_frame", url=value)]},
                    ),
                    {},
                )

    def test_output_video_data_has_priority_and_does_not_persist_interaction_id(self):
        response = interactions.Interaction(
            id="remote-interaction-id",
            status="completed",
            output_video=interactions.VideoContent(
                data=base64.b64encode(MP4).decode(),
                uri="https://media.example.test/fallback.mp4",
                mime_type="video/mp4",
            ),
            steps=[],
        )
        adapter = GoogleOmniVideoAdapter(FakeProvider(response))
        result = run(adapter.create(self.request(), {}))
        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.video_bytes, MP4)
        self.assertIsNone(result.video_url)
        self.assertEqual(result.task_id, "")
        self.assertIsNone(result.raw_response)

    def test_success_result_preserves_provider_diagnostics(self):
        diagnostics = VideoCreateDiagnostics(
            project_resolution_completed=True,
            project_configuration_state="configured",
            project_configuration_source="configured",
            client_initialization_completed=True,
            sdk_create_entered=True,
            sdk_request_serialized=True,
            transport_invocation_started=True,
            provider_response_received=True,
            response_received=True,
            failure_stage="none",
        )
        response = interactions.Interaction(
            status="completed",
            output_video=interactions.VideoContent(
                data=base64.b64encode(MP4).decode(),
                mime_type="video/mp4",
            ),
            steps=[],
        )
        result = run(GoogleOmniVideoAdapter(FakeProvider(response, diagnostics)).create(self.request(), {}))
        self.assertEqual(result.status, "succeeded")
        self.assertTrue(result.diagnostics.project_resolution_completed)
        self.assertEqual(result.diagnostics.project_configuration_state, "configured")
        self.assertEqual(result.diagnostics.project_configuration_source, "configured")
        self.assertTrue(result.diagnostics.client_initialization_completed)
        self.assertTrue(result.diagnostics.sdk_create_entered)
        self.assertTrue(result.diagnostics.sdk_request_serialized)
        self.assertTrue(result.diagnostics.transport_invocation_started)
        self.assertTrue(result.diagnostics.provider_response_received)
        self.assertTrue(result.diagnostics.response_received)
        self.assertEqual(result.diagnostics.failure_stage, "none")
        self.assertTrue(result.diagnostics.interaction_completed)
        self.assertTrue(result.diagnostics.video_output_present)
        self.assertTrue(result.diagnostics.video_bytes_present)

    def test_latest_model_output_data_fallback_and_https_uri_rules(self):
        step = interactions.ModelOutputStep(
            content=[interactions.VideoContent(data=base64.b64encode(MP4).decode(), mime_type="video/mp4")]
        )
        adapter = GoogleOmniVideoAdapter(FakeProvider(interactions.Interaction(status="completed", steps=[step])))
        self.assertEqual(run(adapter.create(self.request(), {})).video_bytes, MP4)

        for uri, expected in (("https://media.example.test/video.mp4", "succeeded"), ("gs://bucket/video.mp4", "failed")):
            adapter = GoogleOmniVideoAdapter(FakeProvider(interactions.Interaction(
                status="completed",
                output_video=interactions.VideoContent(uri=uri, mime_type="video/mp4"),
                steps=[],
            )))
            result = run(adapter.create(self.request(), {}))
            self.assertEqual(result.status, expected)
            if expected == "succeeded":
                self.assertEqual(result.video_url, uri)

    def test_sdk_exception_uses_safe_metadata_and_fixed_message(self):
        provider = ThrowingProvider(UnsafeAdapterError(403))
        result = run(GoogleOmniVideoAdapter(provider).create(self.request(), {}))
        self.assertEqual(provider.calls, 1)
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.message, "Gemini Omni video generation failed.")
        self.assertEqual(result.diagnostics.error_category, "permission")
        self.assertEqual(result.diagnostics.http_status_class, "4xx")
        self.assertEqual(result.diagnostics.exception_type, "UnsafeAdapterError")
        self.assertNotIn("secret.invalid", repr(result))
        self.assertNotIn("private", repr(result))

    def test_interaction_and_output_failures_have_stable_categories(self):
        not_completed = GoogleOmniVideoAdapter(FakeProvider(interactions.Interaction(
            status="failed", steps=[]
        )))
        result = run(not_completed.create(self.request(), {}))
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.diagnostics.error_category, "interaction_not_completed")
        self.assertTrue(result.diagnostics.response_received)
        self.assertFalse(result.diagnostics.interaction_completed)

        missing = GoogleOmniVideoAdapter(FakeProvider(interactions.Interaction(
            status="completed", steps=[]
        )))
        result = run(missing.create(self.request(), {}))
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.diagnostics.error_category, "output_missing")
        self.assertTrue(result.diagnostics.interaction_completed)
        self.assertFalse(result.diagnostics.video_output_present)
        self.assertFalse(result.diagnostics.video_bytes_present)

    def test_query_is_never_supported(self):
        adapter = GoogleOmniVideoAdapter(FakeProvider(None))
        with self.assertRaisesRegex(ValueError, "does not support task queries"):
            run(adapter.query(VideoQueryRequest(
                provider="google_omni",
                model="gemini-omni-flash-preview",
                task_id="never",
            ), {}))


if __name__ == "__main__":
    unittest.main()
