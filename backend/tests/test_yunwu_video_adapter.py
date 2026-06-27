import asyncio
import os
import unittest
from unittest.mock import patch

from video_generation.adapters.errors import VideoProviderError
from video_generation.adapters.registry import get_video_adapter
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
)
from video_generation.adapters.yunwu import YunwuVideoAdapter
from video_generation.capabilities import build_model_schema_snapshot, list_video_model_capabilities
from video_generation.providers.yunwu_veo_provider import YunwuVeoProvider
from video_generation.schemas import VideoGenerateRequest
from video_generation.service import VideoGenerationService


def run(coro):
    return asyncio.run(coro)


async def passthrough_image(self, project_path, value):
    return value


class FakeResponse:
    text = "{}"

    def __init__(self, payload, status_code=200, is_error=False):
        self.payload = payload
        self.status_code = status_code
        self.is_error = is_error

    def json(self):
        return self.payload

    def raise_for_status(self):
        return None


class FakeAsyncClient:
    calls = []
    post_response = FakeResponse({"id": "task-1", "status": "pending"})
    get_response = FakeResponse({"data": {"status": "completed", "video_url": "https://cdn.example/video.mp4"}})

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, url, headers=None, json=None):
        self.calls.append(("post", url, headers, json))
        return self.post_response

    async def get(self, url, headers=None, params=None):
        self.calls.append(("get", url, headers, params))
        return self.get_response


class FakeServiceAdapter:
    provider = "yunwu"
    adapter_id = "yunwu:veo"

    def __init__(self):
        self.created_requests = []
        self.queried_requests = []

    def create_request_from_generate_request(self, request):
        return YunwuVideoAdapter.create_request_from_generate_request(self, request)

    async def create(self, request, capability):
        self.created_requests.append((request, capability))
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id="adapter-task-1",
            status="queued",
            raw_status="pending",
            raw_response={"id": "adapter-task-1", "status": "pending"},
        )

    async def query(self, request, capability):
        self.queried_requests.append((request, capability))
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status="queued",
            raw_status="pending",
            raw_response={"data": {"status": "pending", "message": "waiting"}},
        )


class YunwuVideoAdapterTest(unittest.TestCase):
    def setUp(self):
        FakeAsyncClient.calls = []
        FakeAsyncClient.post_response = FakeResponse({"id": "task-1", "status": "pending"})
        FakeAsyncClient.get_response = FakeResponse({"data": {"status": "completed", "video_url": "https://cdn.example/video.mp4"}})

    def test_registry_returns_yunwu_video_adapter(self):
        adapter = get_video_adapter("yunwu")

        self.assertIsInstance(adapter, YunwuVideoAdapter)
        self.assertEqual(adapter.adapter_id, "yunwu:veo")

    def test_supports_yunwu_capability(self):
        adapter = YunwuVideoAdapter()
        capability = next(capability for capability in list_video_model_capabilities() if capability["provider"] == "yunwu")

        self.assertTrue(adapter.supports(capability))
        self.assertEqual(capability["adapterHints"]["adapterId"], "yunwu:veo")
        self.assertEqual(capability["adapterHints"]["runtime"], "adapter")

    def test_create_request_matches_legacy_service_field_set(self):
        adapter = YunwuVideoAdapter()
        request = VideoGenerateRequest(
            projectPath="mock-project",
            provider="yunwu",
            model="veo3.1",
            videoMode="text-to-video",
            prompt="A quiet city street",
            negativePrompt="low quality",
            aspectRatio="9:16",
            duration="8s",
            durationSeconds=8,
            resolution="1080p",
            enableUpsample=True,
            generateAudio=True,
            seed=42,
            numberOfVideos=2,
            customParams={"enhancePrompt": False, "veoFlClose": True, "futureOption": "kept"},
        )

        create_request = adapter.create_request_from_generate_request(request)

        self.assertEqual(create_request.provider, "yunwu")
        self.assertEqual(create_request.model, "veo3.1")
        self.assertEqual(create_request.task_type, "text-to-video")
        self.assertEqual(create_request.prompt, "A quiet city street")
        self.assertEqual(create_request.project_dir, "mock-project")
        self.assertEqual(create_request.inputs, {})
        self.assertEqual(create_request.params, {
            "negativePrompt": "low quality",
            "aspectRatio": "9:16",
            "enableUpsample": True,
            "enhancePrompt": False,
            "veoFlClose": True,
            "customParams": {"enhancePrompt": False, "veoFlClose": True, "futureOption": "kept"},
        })

        legacy_request = adapter._to_legacy_request(create_request)
        self.assertIsNone(legacy_request.duration)
        self.assertIsNone(legacy_request.durationSeconds)
        self.assertIsNone(legacy_request.resolution)
        self.assertIsNone(legacy_request.generateAudio)
        self.assertIsNone(legacy_request.seed)
        self.assertIsNone(legacy_request.numberOfVideos)
        self.assertEqual(legacy_request.customParams, {
            "enhancePrompt": False,
            "veoFlClose": True,
            "futureOption": "kept",
        })

    def test_create_request_maps_image_to_video_frames(self):
        adapter = YunwuVideoAdapter()
        request = VideoGenerateRequest(
            projectPath="mock-project",
            provider="yunwu",
            model="veo3.1",
            videoMode="image-to-video",
            prompt="Animate this frame",
            images=["mock://first.png", "mock://ignored.png"],
            endImage="mock://last.png",
        )

        create_request = adapter.create_request_from_generate_request(request)

        self.assertEqual(create_request.inputs, {
            "image:firstFrame": [
                VideoInputAsset(kind="image", role="first_frame", url="mock://first.png", handle_id="image:firstFrame"),
            ],
            "image:lastFrame": [
                VideoInputAsset(kind="image", role="last_frame", url="mock://last.png", handle_id="image:lastFrame"),
            ],
        })
        legacy_request = adapter._to_legacy_request(create_request)
        self.assertEqual(legacy_request.images, ["mock://first.png"])
        self.assertEqual(legacy_request.endImage, "mock://last.png")

    def test_create_request_maps_reference_images_without_end_frame(self):
        adapter = YunwuVideoAdapter()
        request = VideoGenerateRequest(
            projectPath="mock-project",
            provider="yunwu",
            model="veo3.1-components",
            videoMode="reference-video",
            prompt="Combine references",
            images=["mock://a.png", "mock://b.png"],
            endImage="mock://not-a-reference.png",
        )

        create_request = adapter.create_request_from_generate_request(request)

        self.assertEqual(create_request.inputs["image:references"], [
            VideoInputAsset(kind="image", role="reference", url="mock://a.png", handle_id="image:references"),
            VideoInputAsset(kind="image", role="reference", url="mock://b.png", handle_id="image:references"),
        ])
        self.assertEqual(create_request.inputs["image:lastFrame"], [
            VideoInputAsset(kind="image", role="last_frame", url="mock://not-a-reference.png", handle_id="image:lastFrame"),
        ])
        legacy_request = adapter._to_legacy_request(create_request)
        self.assertEqual(legacy_request.images, ["mock://a.png", "mock://b.png"])
        self.assertIsNone(legacy_request.endImage)

    def test_text_to_video_payload_matches_legacy_fields(self):
        adapter = YunwuVideoAdapter()
        request = VideoCreateRequest(
            provider="yunwu",
            model="veo3.1",
            task_type="text-to-video",
            prompt="A quiet city street",
            params={"aspectRatio": "9:16", "enableUpsample": True},
        )

        payload = run(adapter.build_create_payload(request, {}))

        self.assertEqual(payload, {
            "model": "veo3.1",
            "prompt": "A quiet city street",
            "aspect_ratio": "9:16",
            "enhance_prompt": True,
            "enable_upsample": True,
        })

    def test_none_params_do_not_override_legacy_defaults(self):
        adapter = YunwuVideoAdapter()
        request = VideoCreateRequest(
            provider="yunwu",
            model="veo3.1",
            task_type="text-to-video",
            prompt="prompt",
            params={"aspectRatio": None, "enableUpsample": None, "enhancePrompt": None, "veoFlClose": None},
        )

        payload = run(adapter.build_create_payload(request, {}))

        self.assertEqual(payload["aspect_ratio"], "16:9")
        self.assertEqual(payload["enhance_prompt"], True)
        self.assertEqual(payload["enable_upsample"], False)
        self.assertNotIn("veo_fl_close", payload)

    def test_image_to_video_payload_matches_legacy_image_order(self):
        adapter = YunwuVideoAdapter()
        request = VideoCreateRequest(
            provider="yunwu",
            model="veo3.1",
            task_type="image-to-video",
            prompt="Animate this frame",
            params={"aspectRatio": "16:9", "veoFlClose": False},
            inputs={
                "image:firstFrame": [VideoInputAsset(kind="image", role="first_frame", url="https://cdn.example/first.png")],
                "image:lastFrame": [VideoInputAsset(kind="image", role="last_frame", url="https://cdn.example/last.png")],
            },
        )

        payload = run(adapter.build_create_payload(request, {}))

        self.assertEqual(payload["images"], ["https://cdn.example/first.png", "https://cdn.example/last.png"])
        self.assertEqual(payload["veo_fl_close"], False)
        self.assertEqual(payload["model"], "veo3.1")
        self.assertEqual(payload["prompt"], "Animate this frame")
        self.assertEqual(payload["aspect_ratio"], "16:9")

    def test_advanced_params_keep_legacy_names(self):
        adapter = YunwuVideoAdapter()
        request = VideoCreateRequest(
            provider="yunwu",
            model="veo3.1",
            task_type="text-to-video",
            prompt="prompt",
            params={
                "negativePrompt": "low quality",
                "enhancePrompt": False,
                "enableUpsample": True,
            },
        )

        payload = run(adapter.build_create_payload(request, {}))

        self.assertEqual(payload["negative_prompt"], "low quality")
        self.assertEqual(payload["enhance_prompt"], False)
        self.assertEqual(payload["enable_upsample"], True)

    def test_reference_payload_matches_components_legacy_fields(self):
        adapter = YunwuVideoAdapter()
        request = VideoCreateRequest(
            provider="yunwu",
            model="veo3.1-components",
            task_type="reference-video",
            prompt="Combine these references",
            params={"veoFlClose": True},
            inputs={
                "image:references": [
                    VideoInputAsset(kind="image", role="reference", url="https://cdn.example/a.png"),
                    VideoInputAsset(kind="image", role="reference", url="https://cdn.example/b.png"),
                ],
            },
        )

        payload = run(adapter.build_create_payload(request, {}))

        self.assertEqual(payload["images"], ["https://cdn.example/a.png", "https://cdn.example/b.png"])
        self.assertEqual(payload["veo_fl_close"], True)

    def test_create_and_query_use_mocked_yunwu_http(self):
        adapter = YunwuVideoAdapter()
        create_request = VideoCreateRequest(
            provider="yunwu",
            model="veo3.1",
            task_type="text-to-video",
            prompt="prompt",
        )

        with (
            patch.dict(os.environ, {"YUNWU_API_KEY": "test-yunwu-key"}, clear=False),
            patch("video_generation.providers.yunwu_veo_provider.httpx.AsyncClient", FakeAsyncClient),
        ):
            create_result = run(adapter.create(create_request, {}))
            query_result = run(adapter.query(VideoQueryRequest(provider="yunwu", model="veo3.1", task_id="task-1"), {}))

        self.assertEqual(create_result.task_id, "task-1")
        self.assertEqual(create_result.status, "queued")
        self.assertEqual(query_result.status, "succeeded")
        self.assertEqual(query_result.video_url, "https://cdn.example/video.mp4")
        self.assertEqual(FakeAsyncClient.calls[0][0], "post")
        self.assertEqual(FakeAsyncClient.calls[1][0], "get")
        self.assertEqual(FakeAsyncClient.calls[0][2]["Authorization"], "Bearer test-yunwu-key")

    def test_query_failed_status_keeps_readable_message(self):
        adapter = YunwuVideoAdapter()
        FakeAsyncClient.get_response = FakeResponse({"data": {"status": "failed", "message": "provider failed"}})

        with (
            patch.dict(os.environ, {"YUNWU_API_KEY": "test-yunwu-key"}, clear=False),
            patch("video_generation.providers.yunwu_veo_provider.httpx.AsyncClient", FakeAsyncClient),
        ):
            result = run(adapter.query(VideoQueryRequest(provider="yunwu", model="veo3.1", task_id="task-1"), {}))

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.message, "provider failed")

    def test_create_http_error_is_wrapped(self):
        adapter = YunwuVideoAdapter()
        FakeAsyncClient.post_response = FakeResponse({"message": "Invalid API key"}, status_code=401, is_error=True)

        with (
            patch.dict(os.environ, {"YUNWU_API_KEY": "test-yunwu-key"}, clear=False),
            patch("video_generation.providers.yunwu_veo_provider.httpx.AsyncClient", FakeAsyncClient),
        ):
            with self.assertRaises(VideoProviderError) as context:
                run(adapter.create(VideoCreateRequest(provider="yunwu", model="veo3.1", task_type="text-to-video", prompt="prompt"), {}))

        self.assertIn("Invalid API key", str(context.exception))
        self.assertEqual(context.exception.category, "auth_error")

    def test_adapter_import_and_init_do_not_read_api_key_or_call_network(self):
        with patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False):
            adapter = YunwuVideoAdapter(YunwuVeoProvider())

        self.assertEqual(adapter.provider, "yunwu")
        self.assertEqual(FakeAsyncClient.calls, [])

    def test_schema_snapshot_excludes_adapter_hints(self):
        capability = next(capability for capability in list_video_model_capabilities() if capability["provider"] == "yunwu")
        snapshot = build_model_schema_snapshot(capability)

        self.assertNotIn("adapterHints", snapshot)

    def test_service_routes_yunwu_create_and_query_through_adapter(self):
        fake_adapter = FakeServiceAdapter()
        request = VideoGenerateRequest(
            provider="yunwu",
            model="veo3.1",
            videoMode="text-to-video",
            prompt="prompt",
        )
        stored_task = {}

        async def fake_upsert_task(project_path, task):
            stored_task["task"] = task

        async def fake_get_task(project_path, task_id):
            return stored_task.get("task")

        with (
            patch("video_generation.service.get_video_adapter", return_value=fake_adapter),
            patch("video_generation.service.upsert_task", fake_upsert_task),
            patch("video_generation.service.get_task", fake_get_task),
        ):
            service = VideoGenerationService(yunwu_api_key="unused")
            task = run(service.create_task("mock-project", request))
            updated = run(service.query_task("mock-project", task.id))

        self.assertEqual(task.providerTaskId, "adapter-task-1")
        self.assertEqual(len(fake_adapter.created_requests), 1)
        self.assertEqual(fake_adapter.created_requests[0][0].provider, "yunwu")
        self.assertEqual(len(fake_adapter.queried_requests), 1)
        self.assertEqual(fake_adapter.queried_requests[0][0].task_id, "adapter-task-1")
        self.assertEqual(updated.provider, "yunwu")


if __name__ == "__main__":
    unittest.main()
