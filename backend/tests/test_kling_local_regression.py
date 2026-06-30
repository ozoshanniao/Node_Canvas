import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from video_generation.providers.kling.omni_payloads import KlingOmniPayloadBuilder
from video_generation.providers.kling.payloads import KlingPayloadBuilder
from video_generation.providers.kling.provider import KlingVideoProvider
from video_generation.schemas import VideoGenerateRequest
from video_generation.service import VideoGenerationService


def run(coro):
    return asyncio.run(coro)


async def passthrough_image_resolution(self, image_ref, project_path):
    return image_ref


class KlingPayloadRegressionTest(unittest.TestCase):
    def setUp(self):
        self.payload_patch = patch.object(
            KlingPayloadBuilder,
            "resolve_image_for_kling",
            passthrough_image_resolution,
        )
        self.omni_patch = patch.object(
            KlingOmniPayloadBuilder,
            "resolve_image_for_kling",
            passthrough_image_resolution,
        )
        self.payload_patch.start()
        self.omni_patch.start()

    def tearDown(self):
        self.omni_patch.stop()
        self.payload_patch.stop()

    def test_kling_text2video_payload_params(self):
        builder = KlingPayloadBuilder()
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3",
            videoMode="text-to-video",
            prompt="A cinematic rabbit.",
            aspectRatio="9:16",
            duration="7s",
            qualityMode="pro",
            generateAudio=True,
            seed=12345,
            customParams={
                "kling": {
                    "shotMode": "single",
                    "cfgScale": 0.7,
                    "cameraControl": {
                        "type": "simple",
                        "axis": "pan",
                        "value": 4,
                    },
                }
            },
        )

        payload = run(builder.build_text2video(request, None))

        self.assertEqual(payload["model_name"], "kling-v3")
        self.assertEqual(payload["prompt"], "A cinematic rabbit.")
        self.assertEqual(payload["aspect_ratio"], "9:16")
        self.assertEqual(payload["duration"], "7")
        self.assertEqual(payload["mode"], "pro")
        self.assertEqual(payload["sound"], "on")
        self.assertNotIn("seed", payload)
        self.assertEqual(payload["cfg_scale"], 0.7)
        self.assertEqual(payload["camera_control"], {"type": "simple", "config": {"pan": 4}})
        self.assertIs(payload["multi_shot"], False)
        self.assertEqual(payload["callback_url"], "")
        self.assertEqual(payload["external_task_id"], "")

    def test_kling_image2video_payload_with_end_frame_and_mode(self):
        builder = KlingPayloadBuilder()
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3",
            videoMode="image-to-video",
            prompt="Animate the frame.",
            images=["https://example.test/start.png"],
            endImage="https://example.test/end.png",
            duration="10s",
            qualityMode="std",
            generateAudio=False,
            seed=12345,
        )

        payload = run(builder.build_image2video(request, None))

        self.assertEqual(payload["image"], "https://example.test/start.png")
        self.assertEqual(payload["image_tail"], "https://example.test/end.png")
        self.assertEqual(payload["duration"], "10")
        self.assertEqual(payload["mode"], "std")
        self.assertEqual(payload["sound"], "off")
        self.assertNotIn("seed", payload)
        self.assertNotIn("aspect_ratio", payload)
        self.assertNotIn("camera_control", payload)

    def test_kling_multi_prompt_payload_sets_duration_and_shots(self):
        builder = KlingPayloadBuilder()
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3",
            videoMode="text-to-video",
            prompt="",
            duration="5s",
            customParams={
                "kling": {
                    "shotMode": "customize",
                    "multiPrompt": [
                        {"index": 1, "prompt": "Wide establishing shot.", "duration": "2"},
                        {"index": 2, "prompt": "Close-up action.", "duration": "3"},
                    ],
                }
            },
        )

        payload = run(builder.build_text2video(request, None))

        self.assertIs(payload["multi_shot"], True)
        self.assertEqual(payload["shot_type"], "customize")
        self.assertEqual(payload["prompt"], "")
        self.assertEqual(payload["duration"], "5")
        self.assertEqual(payload["multi_prompt"], [
            {"prompt": "Wide establishing shot.", "duration": "2"},
            {"prompt": "Close-up action.", "duration": "3"},
        ])

    def test_kling_omni_payload_with_elements_single_shot(self):
        builder = KlingOmniPayloadBuilder()
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
            aspectRatio="16:9",
            duration="5s",
            generateAudio=True,
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Use @element_1 in scene.",
                        "resolvedPrompt": "Use <<<element_1>>> in scene.",
                        "shotMode": "single",
                        "elements": [{"alias": "element_1", "elementId": 123456}],
                        "images": [],
                        "videos": [],
                    }
                }
            },
        )

        payload = run(builder.build_omni_payload(request, None))

        self.assertEqual(payload["model_name"], "kling-v3-omni")
        self.assertEqual(payload["prompt"], "Use <<<element_1>>> in scene.")
        self.assertIs(payload["multi_shot"], False)
        self.assertEqual(payload["element_list"], [{"element_id": 123456}])
        self.assertEqual(payload["aspect_ratio"], "16:9")
        self.assertEqual(payload["sound"], "on")

    def test_kling_omni_payload_sound_off_when_generate_audio_false(self):
        builder = KlingOmniPayloadBuilder()
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
            generateAudio=False,
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Use @element_1 in scene.",
                        "resolvedPrompt": "Use <<<element_1>>> in scene.",
                        "shotMode": "single",
                        "elements": [{"alias": "element_1", "elementId": 123456}],
                        "images": [],
                        "videos": [],
                    }
                }
            },
        )

        payload = run(builder.build_omni_payload(request, None))

        self.assertEqual(payload["sound"], "off")

    def test_kling_omni_payload_multi_prompt_and_images(self):
        builder = KlingOmniPayloadBuilder()
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
            durationSeconds=5,
            images=["https://example.test/ref1.png", "https://example.test/ref2.png"],
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "",
                        "shotMode": "customize",
                        "images": [
                            {"alias": "image_1", "index": 0, "role": "reference"},
                            {"alias": "image_2", "index": 1, "role": "reference"},
                        ],
                        "elements": [],
                        "videos": [],
                        "multiPrompt": [
                            {"index": 1, "prompt": "Start with @image_1.", "duration": "2"},
                            {"index": 2, "prompt": "Cut to <<<image_2>>>.", "duration": "3"},
                        ],
                    }
                }
            },
        )

        payload = run(builder.build_omni_payload(request, None))

        self.assertIs(payload["multi_shot"], True)
        self.assertEqual(payload["shot_type"], "customize")
        self.assertEqual(payload["prompt"], "")
        self.assertEqual(payload["multi_prompt"], [
            {"index": 1, "prompt": "Start with <<<image_1>>>.", "duration": "2"},
            {"index": 2, "prompt": "Cut to <<<image_2>>>.", "duration": "3"},
        ])
        self.assertEqual(payload["image_list"], [
            {"image_url": "https://example.test/ref1.png"},
            {"image_url": "https://example.test/ref2.png"},
        ])

    def test_kling_omni_rejects_raw_url_and_invalid_index(self):
        builder = KlingOmniPayloadBuilder()
        base_request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
            images=["https://example.test/ref1.png"],
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Use @image_1.",
                        "images": [{"alias": "image_1", "index": 0, "role": "reference"}],
                        "elements": [],
                    }
                }
            },
        )

        payload = run(builder.build_omni_payload(base_request, None))
        self.assertEqual(payload["image_list"], [{"image_url": "https://example.test/ref1.png"}])

        for forbidden_key in ("url", "uri", "path", "endpoint", "token", "key"):
            request = base_request.model_copy(deep=True)
            request.customParams["kling"]["omniParams"]["images"] = [
                {"alias": "image_1", "index": 0, forbidden_key: "https://secret.example/ref.png"}
            ]
            with self.assertRaisesRegex(ValueError, "obsolete"):
                run(builder.build_omni_payload(request, None))

        for bad_index in (None, True, -1, 1):
            request = base_request.model_copy(deep=True)
            request.customParams["kling"]["omniParams"]["images"] = [
                {"alias": "image_1", "index": bad_index, "role": "reference"}
            ]
            with self.assertRaisesRegex(ValueError, "index|unavailable"):
                run(builder.build_omni_payload(request, None))
    def test_kling_provider_payload_branch_selection(self):
        provider = KlingVideoProvider(provider_type="kling")
        calls = []

        async def text_payload(request, project_path):
            calls.append(("text", request.model))
            return {"kind": "text"}

        async def omni_payload(request, project_path):
            calls.append(("omni", request.model))
            return {"kind": "omni"}

        with patch.object(provider.payload_builder, "build_text2video", text_payload), patch.object(
            provider.omni_payload_builder,
            "build_omni_payload",
            omni_payload,
        ):
            non_omni = VideoGenerateRequest(
                provider="kling",
                model="kling-v3",
                videoMode="text-to-video",
                prompt="Text",
            )
            omni = VideoGenerateRequest(
                provider="kling",
                model="kling-v3-omni",
                videoMode="omni-video",
                prompt="",
                customParams={"kling": {"omniParams": {"prompt": "Omni"}}},
            )

            self.assertEqual(run(provider._payload_for_kind("text2video", non_omni)), {"kind": "text"})
            self.assertEqual(run(provider._payload_for_kind("omni-video", omni)), {"kind": "omni"})

        self.assertEqual(calls, [("text", "kling-v3"), ("omni", "kling-v3-omni")])

    def test_yunwu_kling_provider_uses_same_payload_builder_without_client_request(self):
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        request = VideoGenerateRequest(
            provider="yunwu-kling",
            model="kling-v3",
            videoMode="image-to-video",
            prompt="Yunwu Kling image task",
            images=["https://example.test/start.png"],
            aspectRatio="1:1",
            duration="8s",
            qualityMode="std",
            generateAudio=True,
            customParams={"kling": {"shotMode": "single", "cfgScale": 0.4}},
        )

        payload = run(provider._payload_for_kind("image2video", request))

        self.assertEqual(payload["model_name"], "kling-v3")
        self.assertEqual(payload["prompt"], "Yunwu Kling image task")
        self.assertEqual(payload["image"], "https://example.test/start.png")
        # Current image2video builder omits aspect_ratio even though specs expose it.
        self.assertNotIn("aspect_ratio", payload)
        self.assertEqual(payload["duration"], "8")
        self.assertEqual(payload["mode"], "std")
        self.assertEqual(payload["sound"], "on")
        self.assertNotIn("seed", payload)
        self.assertEqual(payload["cfg_scale"], 0.4)

    def test_yunwu_kling_client_branch_is_separate_from_official_kling(self):
        provider = KlingVideoProvider(provider_type="yunwu-kling")

        with patch("video_generation.providers.kling.provider.KlingOfficialClient") as official_client, patch(
            "video_generation.providers.kling.provider.YunwuKlingClient"
        ) as yunwu_kling_client:
            provider._client()

        official_client.assert_not_called()
        yunwu_kling_client.assert_called_once()

    def test_official_kling_client_branch_is_separate_from_yunwu_kling(self):
        provider = KlingVideoProvider(provider_type="kling")

        with patch("video_generation.providers.kling.provider.KlingOfficialClient") as official_client, patch(
            "video_generation.providers.kling.provider.YunwuKlingClient"
        ) as yunwu_kling_client:
            provider._client()

        official_client.assert_called_once()
        yunwu_kling_client.assert_not_called()


class FakeKlingProvider:
    def __init__(self, provider_id="kling"):
        self.provider_id = provider_id
        self.created_requests = []
        self.query_responses = []
        self.query_calls = []

    async def create_task(self, request):
        self.created_requests.append(request)
        return {
            "providerTaskId": f"{self.provider_id}:{request.model}:mock-provider-task",
            "status": "queued",
            "message": f"{self.provider_id} mock queued",
            "raw": {"mock": True, "provider": self.provider_id},
        }

    async def query_task(self, provider_task_id):
        self.query_calls.append(provider_task_id)
        if self.query_responses:
            response = self.query_responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        return {"status": "running", "message": "mock running"}


class KlingEndpointRegressionTest(unittest.TestCase):
    def setUp(self):
        import main
        import video_generation.service as service_module

        self.project_path = "mock-project"
        self.tasks = {}
        self.main = main
        self.service = VideoGenerationService(yunwu_api_key="mock")
        self.fake_kling = FakeKlingProvider("kling")
        self.fake_yunwu_kling = FakeKlingProvider("yunwu-kling")
        self.service.providers["kling"] = self.fake_kling
        self.service.providers["yunwu-kling"] = self.fake_yunwu_kling
        self.service_patch = patch.object(main, "video_generation_service", self.service)
        self.upsert_patch = patch.object(service_module, "upsert_task", self._upsert_task)
        self.get_patch = patch.object(service_module, "get_task", self._get_task)
        self.service_patch.start()
        self.upsert_patch.start()
        self.get_patch.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.get_patch.stop()
        self.upsert_patch.stop()
        self.service_patch.stop()

    async def _upsert_task(self, project_path, task):
        self.tasks[task.id] = task
        return task

    async def _get_task(self, project_path, task_id):
        return self.tasks.get(task_id)

    def test_video_specs_endpoint_includes_kling(self):
        response = self.client.get("/api/video/specs")

        self.assertEqual(response.status_code, 200)
        providers = {provider["id"]: provider for provider in response.json()["providers"]}
        self.assertIn("kling", providers)
        self.assertIn("yunwu-kling", providers)
        self.assertGreaterEqual(
            {model["id"] for model in providers["kling"]["models"]},
            {"kling-v2-6", "kling-v3", "kling-v3-omni"},
        )
        self.assertGreaterEqual(
            {model["id"] for model in providers["yunwu-kling"]["models"]},
            {"kling-v2-6", "kling-v3", "kling-v3-omni"},
        )
        self.assertEqual(
            {
                model["id"]: model["adapterKey"]
                for model in providers["kling"]["models"]
                if model["id"] in {"kling-v2-6", "kling-v3", "kling-v3-omni"}
            },
            {
                "kling-v2-6": "kling",
                "kling-v3": "kling",
                "kling-v3-omni": "kling",
            },
        )
        for provider_id in ("kling", "yunwu-kling"):
            for model in providers[provider_id]["models"]:
                if model["id"] in {"kling-v2-6", "kling-v3", "kling-v3-omni"}:
                    self.assertNotIn("seed", model["params"])
                    self.assertIn("generateAudio", model["params"])
        self.assertEqual(
            {
                model["id"]: model["adapterKey"]
                for model in providers["yunwu-kling"]["models"]
                if model["id"] in {"kling-v2-6", "kling-v3", "kling-v3-omni"}
            },
            {
                "kling-v2-6": "yunwu-kling",
                "kling-v3": "yunwu-kling",
                "kling-v3-omni": "yunwu-kling",
            },
        )

    def test_video_generate_endpoint_uses_mock_kling_provider(self):
        response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "kling",
            "model": "kling-v3",
            "videoMode": "text-to-video",
            "prompt": "Mock Kling task",
            "duration": "5s",
            "customParams": {"kling": {"shotMode": "single"}},
        })

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["data"]["status"], "queued")
        self.assertEqual(self.fake_kling.created_requests[0].model, "kling-v3")
        self.assertEqual(self.fake_kling.created_requests[0].videoMode, "text-to-video")
        self.assertEqual(self.fake_kling.created_requests[0].provider, "kling")
        self.assertEqual(self.fake_yunwu_kling.created_requests, [])

    def test_video_generate_endpoint_routes_same_model_to_yunwu_kling_provider(self):
        response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "yunwu-kling",
            "model": "kling-v3",
            "videoMode": "text-to-video",
            "prompt": "Mock Yunwu Kling task",
            "aspectRatio": "9:16",
            "duration": "6s",
            "qualityMode": "pro",
            "generateAudio": True,
            "customParams": {"kling": {"shotMode": "single", "cfgScale": 0.5}},
        })

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["data"]["provider"], "yunwu-kling")
        self.assertEqual(body["data"]["model"], "kling-v3")
        self.assertEqual(body["data"]["schemaVersion"], "v2")
        self.assertNotIn("request", body["data"])
        self.assertNotIn("requestSnapshot", body["data"])
        self.assertEqual(len(self.fake_yunwu_kling.created_requests), 1)
        self.assertEqual(self.fake_yunwu_kling.created_requests[0].provider, "yunwu-kling")
        self.assertEqual(self.fake_yunwu_kling.created_requests[0].model, "kling-v3")
        self.assertEqual(self.fake_kling.created_requests, [])

    def test_same_kling_model_routes_by_provider_not_model_name(self):
        official_response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "kling",
            "model": "kling-v2-6",
            "videoMode": "text-to-video",
            "prompt": "Official provider",
        })
        yunwu_response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "yunwu-kling",
            "model": "kling-v2-6",
            "videoMode": "text-to-video",
            "prompt": "Yunwu provider",
        })

        self.assertEqual(official_response.status_code, 200)
        self.assertEqual(yunwu_response.status_code, 200)
        self.assertEqual(len(self.fake_kling.created_requests), 1)
        self.assertEqual(len(self.fake_yunwu_kling.created_requests), 1)
        self.assertEqual(self.fake_kling.created_requests[0].provider, "kling")
        self.assertEqual(self.fake_yunwu_kling.created_requests[0].provider, "yunwu-kling")

    def test_video_generate_endpoint_accepts_yunwu_kling_image2video(self):
        response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "yunwu-kling",
            "model": "kling-v3",
            "videoMode": "image-to-video",
            "prompt": "Mock Yunwu Kling image task",
            "images": ["https://example.test/start.png"],
            "aspectRatio": "1:1",
            "duration": "10s",
            "qualityMode": "std",
        })

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["data"]["provider"], "yunwu-kling")
        self.assertEqual(body["data"]["videoMode"], "image-to-video")
        self.assertNotIn("request", body["data"])
        self.assertEqual(body["data"]["outputs"], {})

    def test_video_task_query_mock_running_and_failed(self):
        create_response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "kling",
            "model": "kling-v3-omni",
            "videoMode": "omni-video",
            "prompt": "",
            "customParams": {
                "kling": {
                    "omniParams": {
                        "prompt": "Use @element_1.",
                        "resolvedPrompt": "Use <<<element_1>>>.",
                        "elements": [{"alias": "element_1", "elementId": 123456}],
                        "images": [],
                        "videos": [],
                    }
                }
            },
        })
        task_id = create_response.json()["data"]["id"]

        self.fake_kling.query_responses.append({"status": "running", "message": "still running"})
        running = self.client.get(f"/api/video/tasks/{task_id}", params={"projectPath": self.project_path})
        self.assertEqual(running.status_code, 200)
        self.assertEqual(running.json()["data"]["status"], "running")

        self.fake_kling.query_responses.append({"status": "error", "message": "mock failed"})
        failed = self.client.get(f"/api/video/tasks/{task_id}", params={"projectPath": self.project_path})
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.json()["data"]["status"], "error")
        self.assertEqual(failed.json()["data"]["message"], "Kling: mock failed")

    def test_video_task_query_exception_marks_interrupted_and_can_resume(self):
        create_response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "kling",
            "model": "kling-v3",
            "videoMode": "text-to-video",
            "prompt": "Recoverable query task",
        })
        self.assertEqual(create_response.status_code, 200)
        created_task = create_response.json()["data"]
        task_id = created_task["id"]
        provider_task_id = created_task["providerTaskId"]

        self.fake_kling.query_responses.append(TimeoutError("temporary query timeout"))
        interrupted = self.client.get(f"/api/video/tasks/{task_id}", params={"projectPath": self.project_path})
        interrupted_task = interrupted.json()["data"]

        self.assertEqual(interrupted.status_code, 200)
        self.assertEqual(interrupted_task["status"], "interrupted")
        self.assertEqual(interrupted_task["providerTaskId"], provider_task_id)
        self.assertNotIn("rawCreateResponse", interrupted_task["outputs"])
        self.assertNotIn("request", interrupted_task)
        self.assertIn("retry querying", interrupted_task["message"])
        self.assertIn("temporary query timeout", interrupted_task["error"])

        self.fake_kling.query_responses.append({"status": "running", "message": "resumed"})
        resumed = self.client.get(f"/api/video/tasks/{task_id}", params={"projectPath": self.project_path})

        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["data"]["status"], "running")
        self.assertEqual(resumed.json()["data"]["providerTaskId"], provider_task_id)
        self.assertEqual(self.fake_kling.query_calls[-2:], [provider_task_id, provider_task_id])

    def test_yunwu_kling_task_query_mock_running_success_and_failed(self):
        create_response = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "yunwu-kling",
            "model": "kling-v3-omni",
            "videoMode": "omni-video",
            "prompt": "",
            "customParams": {
                "kling": {
                    "omniParams": {
                        "prompt": "Use @element_1.",
                        "resolvedPrompt": "Use <<<element_1>>>.",
                        "elements": [{"alias": "element_1", "elementId": 123456}],
                        "images": [],
                        "videos": [],
                    }
                }
            },
        })
        self.assertEqual(create_response.status_code, 200)
        task_id = create_response.json()["data"]["id"]
        self.assertEqual(create_response.json()["data"]["provider"], "yunwu-kling")

        self.fake_yunwu_kling.query_responses.append({"status": "running", "message": "yunwu running"})
        running = self.client.get(f"/api/video/tasks/{task_id}", params={"projectPath": self.project_path})
        self.assertEqual(running.status_code, 200)
        self.assertEqual(running.json()["data"]["provider"], "yunwu-kling")
        self.assertEqual(running.json()["data"]["status"], "running")

        self.fake_yunwu_kling.query_responses.append({
            "status": "success",
            "message": "yunwu done",
            "remoteVideoUrl": "https://cdn.example.test/yunwu-kling.mp4",
        })
        with patch(
            "video_generation.service.download_video_to_project",
            AsyncMock(return_value=f"/api/video/{task_id}.mp4"),
        ):
            succeeded = self.client.get(f"/api/video/tasks/{task_id}", params={"projectPath": self.project_path})
        self.assertEqual(succeeded.status_code, 200)
        self.assertEqual(succeeded.json()["data"]["provider"], "yunwu-kling")
        self.assertEqual(succeeded.json()["data"]["status"], "success")

        failed_task = self.client.post("/api/video/generate", json={
            "projectPath": self.project_path,
            "provider": "yunwu-kling",
            "model": "kling-v3",
            "videoMode": "text-to-video",
            "prompt": "Failing Yunwu Kling task",
        }).json()["data"]["id"]
        self.fake_yunwu_kling.query_responses.append({"status": "error", "message": "mock failed"})
        failed = self.client.get(f"/api/video/tasks/{failed_task}", params={"projectPath": self.project_path})
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.json()["data"]["provider"], "yunwu-kling")
        self.assertEqual(failed.json()["data"]["status"], "error")
        self.assertEqual(failed.json()["data"]["message"], "Yunwu-Kling: mock failed")


if __name__ == "__main__":
    unittest.main()
