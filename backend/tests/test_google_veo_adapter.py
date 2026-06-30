import asyncio
import os
import unittest
from unittest.mock import patch

from video_generation.adapters.errors import VideoProviderError
from video_generation.adapters.google_veo import GoogleVeoVideoAdapter
from video_generation.adapters.registry import get_video_adapter
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
)
from video_generation.capabilities import build_model_schema_snapshot, list_video_model_capabilities
from video_generation.providers.google_veo_provider import GoogleVeoProvider
from video_generation.schemas import VideoGenerateRequest
from video_generation.service import VideoGenerationService


def run(coro):
    return asyncio.run(coro)


DATA_IMAGE = "data:image/png;base64,iVBORw0KGgo="


class FakeLegacyGoogleProvider:
    def __init__(self):
        self.created_requests = []
        self.queried_task_ids = []
        self.create_response = {"providerTaskId": "operations/google-task-1", "status": "running", "raw": {"name": "operations/google-task-1"}}
        self.query_response = {"status": "success", "remoteVideoUrl": "https://cdn.example/video.mp4", "raw": {"done": True}}

    async def build_create_payload(self, request):
        return {"source": {"prompt": request.prompt}, "config": {"model": request.model}}

    async def create_task(self, request):
        self.created_requests.append(request)
        return self.create_response

    async def query_task(self, provider_task_id):
        self.queried_task_ids.append(provider_task_id)
        return self.query_response


class FakeServiceAdapter:
    provider = "google"
    adapter_id = "google:veo"

    def __init__(self):
        self.created_requests = []
        self.queried_requests = []

    async def create(self, request, capability):
        self.created_requests.append((request, capability))
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id="operations/google-task-1",
            status="running",
            raw_status="running",
            raw_response={"providerTaskId": "operations/google-task-1", "status": "running"},
        )

    async def query(self, request, capability):
        self.queried_requests.append((request, capability))
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status="running",
            raw_status="running",
            raw_response={"status": "running", "raw": {"done": False}},
        )

    def create_request_from_generate_request(self, request):
        return VideoCreateRequest(
            provider=request.provider,
            model=request.model,
            task_type=request.videoMode,
            prompt=request.prompt,
            project_dir=request.projectPath,
        )


class GoogleVeoVideoAdapterTest(unittest.TestCase):
    def test_registry_returns_google_veo_adapter(self):
        adapter = get_video_adapter("google")

        self.assertIsInstance(adapter, GoogleVeoVideoAdapter)
        self.assertEqual(adapter.adapter_id, "google:veo")

    def test_supports_google_capability(self):
        adapter = GoogleVeoVideoAdapter()
        capability = next(capability for capability in list_video_model_capabilities() if capability["provider"] == "google")

        self.assertTrue(adapter.supports(capability))
        self.assertEqual(capability["adapterHints"]["adapterId"], "google:veo")
        self.assertEqual(capability["adapterHints"]["runtime"], "adapter")

    def test_text_to_video_source_and_config_match_legacy_fields(self):
        adapter = GoogleVeoVideoAdapter()
        request = VideoCreateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_type="text-to-video",
            prompt="A city at dawn",
            params={
                "aspectRatio": "9:16",
                "durationSeconds": 6,
                "resolution": "720p",
                "generateAudio": True,
                "seed": 123,
                "numberOfVideos": 2,
                "negativePrompt": "low quality",
            },
        )

        payload = run(adapter.build_create_payload(request, {}))
        serialized = adapter._legacy_provider._serialize(payload)

        self.assertEqual(serialized["source"]["prompt"], "A city at dawn")
        self.assertEqual(serialized["config"]["aspect_ratio"], "9:16")
        self.assertEqual(serialized["config"]["duration_seconds"], 6)
        self.assertEqual(serialized["config"]["resolution"], "720p")
        self.assertEqual(serialized["config"]["generate_audio"], True)
        self.assertEqual(serialized["config"]["seed"], 123)
        self.assertEqual(serialized["config"]["number_of_videos"], 2)
        self.assertEqual(serialized["config"]["negative_prompt"], "low quality")
        self.assertEqual(serialized["config"]["person_generation"], "allow_all")

    def test_image_to_video_source_and_last_frame_match_legacy_fields(self):
        adapter = GoogleVeoVideoAdapter()
        request = VideoCreateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_type="image-to-video",
            prompt="Animate this",
            params={"aspectRatio": "16:9", "duration": "8s", "resolution": "1080p"},
            inputs={
                "image:firstFrame": [VideoInputAsset(kind="image", role="first_frame", url=DATA_IMAGE)],
                "image:lastFrame": [VideoInputAsset(kind="image", role="last_frame", url=DATA_IMAGE)],
            },
        )

        payload = run(adapter.build_create_payload(request, {}))
        serialized = adapter._legacy_provider._serialize(payload)

        self.assertIn("image", serialized["source"])
        self.assertIn("last_frame", serialized["config"])
        self.assertEqual(serialized["config"]["duration_seconds"], 8)
        self.assertEqual(serialized["config"]["resolution"], "1080p")
        self.assertEqual(serialized["config"]["person_generation"], "allow_adult")

    def test_reference_images_match_legacy_fields(self):
        adapter = GoogleVeoVideoAdapter()
        request = VideoCreateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_type="reference-video",
            prompt="Use references",
            params={"durationSeconds": 4},
            inputs={
                "image:references": [
                    VideoInputAsset(kind="image", role="reference", url=DATA_IMAGE),
                    VideoInputAsset(kind="image", role="reference", url=DATA_IMAGE),
                ],
            },
        )

        payload = run(adapter.build_create_payload(request, {}))
        serialized = adapter._legacy_provider._serialize(payload)

        self.assertEqual(serialized["config"]["duration_seconds"], 8)
        self.assertEqual(len(serialized["config"]["reference_images"]), 2)

    def test_forced_1080p_params_reach_payload_config(self):
        adapter = GoogleVeoVideoAdapter()
        request = VideoCreateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_type="text-to-video",
            prompt="A waterfall at sunrise",
            params={
                "videoMode": "text-to-video",
                "aspectRatio": "16:9",
                "duration": "8s",
                "durationSeconds": 8,
                "resolution": "1080p",
            },
        )

        payload = run(adapter.build_create_payload(request, {}))
        serialized = adapter._legacy_provider._serialize(payload)

        self.assertEqual(serialized["source"], {"prompt": "A waterfall at sunrise"})
        self.assertEqual(serialized["config"]["aspect_ratio"], "16:9")
        self.assertEqual(serialized["config"]["duration_seconds"], 8)
        self.assertEqual(serialized["config"]["resolution"], "1080p")

    def test_none_params_keep_legacy_defaults(self):
        adapter = GoogleVeoVideoAdapter()
        request = VideoCreateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_type="text-to-video",
            prompt="prompt",
            params={
                "aspectRatio": None,
                "duration": None,
                "durationSeconds": None,
                "resolution": None,
                "generateAudio": None,
                "seed": None,
                "numberOfVideos": None,
                "negativePrompt": None,
            },
        )

        payload = run(adapter.build_create_payload(request, {}))
        serialized = adapter._legacy_provider._serialize(payload)

        self.assertEqual(serialized["config"]["aspect_ratio"], "16:9")
        self.assertEqual(serialized["config"]["duration_seconds"], 8)
        self.assertEqual(serialized["config"]["resolution"], "720p")
        self.assertEqual(serialized["config"]["generate_audio"], False)
        self.assertEqual(serialized["config"]["number_of_videos"], 1)
        self.assertNotIn("negative_prompt", serialized["config"])

    def test_create_request_from_generate_request_maps_google_fields(self):
        adapter = GoogleVeoVideoAdapter(FakeLegacyGoogleProvider())
        request = VideoGenerateRequest(
            projectPath="mock-project",
            provider="google",
            model="veo-3.1-generate-001",
            videoMode="image-to-video",
            prompt="Animate this",
            negativePrompt="low quality",
            aspectRatio="16:9",
            duration="8s",
            durationSeconds=8,
            resolution="1080p",
            generateAudio=True,
            seed=123,
            numberOfVideos=2,
            images=[DATA_IMAGE],
            endImage=DATA_IMAGE,
        )

        create_request = adapter.create_request_from_generate_request(request)

        self.assertEqual(create_request.provider, "google")
        self.assertEqual(create_request.model, "veo-3.1-generate-001")
        self.assertEqual(create_request.task_type, "image-to-video")
        self.assertEqual(create_request.prompt, "Animate this")
        self.assertEqual(create_request.project_dir, "mock-project")
        self.assertEqual(create_request.params["negativePrompt"], "low quality")
        self.assertEqual(create_request.params["aspectRatio"], "16:9")
        self.assertEqual(create_request.params["duration"], "8s")
        self.assertEqual(create_request.params["durationSeconds"], 8)
        self.assertEqual(create_request.params["resolution"], "1080p")
        self.assertEqual(create_request.params["generateAudio"], True)
        self.assertEqual(create_request.params["seed"], 123)
        self.assertEqual(create_request.params["numberOfVideos"], 2)
        self.assertEqual(create_request.inputs["image:firstFrame"][0].url, DATA_IMAGE)
        self.assertEqual(create_request.inputs["image:lastFrame"][0].url, DATA_IMAGE)

    def test_create_request_from_generate_request_maps_google_references(self):
        adapter = GoogleVeoVideoAdapter(FakeLegacyGoogleProvider())
        request = VideoGenerateRequest(
            projectPath="mock-project",
            provider="google",
            model="veo-3.1-generate-001",
            videoMode="reference-video",
            prompt="Use references",
            images=[DATA_IMAGE, DATA_IMAGE],
        )

        create_request = adapter.create_request_from_generate_request(request)

        self.assertEqual(create_request.task_type, "reference-video")
        self.assertEqual([asset.role for asset in create_request.inputs["image:references"]], ["reference", "reference"])
        self.assertNotIn("image:firstFrame", create_request.inputs)

    def test_create_and_query_use_mocked_legacy_provider(self):
        legacy = FakeLegacyGoogleProvider()
        adapter = GoogleVeoVideoAdapter(legacy)

        create_result = run(adapter.create(VideoCreateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_type="text-to-video",
            prompt="prompt",
        ), {}))
        query_result = run(adapter.query(VideoQueryRequest(
            provider="google",
            model="veo-3.1-generate-001",
            task_id="operations/google-task-1",
        ), {}))

        self.assertEqual(create_result.task_id, "operations/google-task-1")
        self.assertEqual(create_result.status, "running")
        self.assertEqual(query_result.status, "succeeded")
        self.assertEqual(query_result.video_url, "https://cdn.example/video.mp4")
        self.assertEqual(len(legacy.created_requests), 1)
        self.assertEqual(legacy.queried_task_ids, ["operations/google-task-1"])

    def test_query_running_and_failed_statuses(self):
        legacy = FakeLegacyGoogleProvider()
        adapter = GoogleVeoVideoAdapter(legacy)

        legacy.query_response = {"status": "running", "raw": {"done": False}}
        running = run(adapter.query(VideoQueryRequest(provider="google", model="veo-3.1-generate-001", task_id="task"), {}))
        self.assertEqual(running.status, "running")

        legacy.query_response = {"status": "error", "message": "operation failed", "raw": {"error": "operation failed"}}
        failed = run(adapter.query(VideoQueryRequest(provider="google", model="veo-3.1-generate-001", task_id="task"), {}))
        self.assertEqual(failed.status, "failed")
        self.assertEqual(failed.message, "operation failed")

    def test_errors_are_wrapped_with_readable_message(self):
        class FailingProvider(FakeLegacyGoogleProvider):
            async def create_task(self, request):
                raise ValueError("Google credentials missing")

        adapter = GoogleVeoVideoAdapter(FailingProvider())

        with self.assertRaises(VideoProviderError) as context:
            run(adapter.create(VideoCreateRequest(provider="google", model="veo-3.1-generate-001", task_type="text-to-video", prompt="prompt"), {}))

        self.assertIn("Google credentials missing", str(context.exception))
        self.assertEqual(context.exception.category, "auth_error")

    def test_service_routes_google_create_and_query_through_adapter(self):
        fake_adapter = FakeServiceAdapter()
        stored_task = {}

        async def fake_upsert_task(project_path, task):
            stored_task["task"] = task

        async def fake_get_task(project_path, task_id):
            return stored_task.get("task")

        request = VideoGenerateRequest(
            provider="google",
            model="veo-3.1-generate-001",
            videoMode="text-to-video",
            prompt="prompt",
        )

        with (
            patch("video_generation.service.get_video_adapter", return_value=fake_adapter),
            patch("video_generation.service.upsert_task", fake_upsert_task),
            patch("video_generation.service.get_task", fake_get_task),
        ):
            service = VideoGenerationService()
            task = run(service.create_task("mock-project", request))
            updated = run(service.query_task("mock-project", task.id))

        self.assertEqual(task.providerTaskId, "operations/google-task-1")
        self.assertEqual(task.message, "Google video task started.")
        self.assertEqual(len(fake_adapter.created_requests), 1)
        self.assertEqual(fake_adapter.created_requests[0][0].provider, "google")
        self.assertEqual(len(fake_adapter.queried_requests), 1)
        self.assertEqual(fake_adapter.queried_requests[0][0].task_id, "operations/google-task-1")
        self.assertEqual(updated.provider, "google")

    def test_yunwu_and_legacy_providers_do_not_resolve_to_google_adapter(self):
        self.assertNotIsInstance(get_video_adapter("yunwu"), GoogleVeoVideoAdapter)
        self.assertNotIsInstance(get_video_adapter("kling"), GoogleVeoVideoAdapter)
        self.assertNotIsInstance(get_video_adapter("yunwu-kling"), GoogleVeoVideoAdapter)
        self.assertNotIsInstance(get_video_adapter("seedance_official"), GoogleVeoVideoAdapter)

    def test_adapter_import_and_init_do_not_read_credentials_or_call_network(self):
        with patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": "", "GOOGLE_PROJECT_ID": ""}, clear=False):
            adapter = GoogleVeoVideoAdapter(GoogleVeoProvider(project=None, location=None))

        self.assertEqual(adapter.provider, "google")

    def test_schema_snapshot_excludes_adapter_hints(self):
        capability = next(capability for capability in list_video_model_capabilities() if capability["provider"] == "google")
        snapshot = build_model_schema_snapshot(capability)

        self.assertNotIn("adapterHints", snapshot)


if __name__ == "__main__":
    unittest.main()
