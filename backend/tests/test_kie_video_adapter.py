import unittest
from unittest.mock import patch

from media.provider_asset_uploader import ProviderAssetUploadResult
from video_generation.adapters.errors import VideoProviderError
from video_generation.adapters.kie import KieVideoAdapter
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
)
from video_generation.providers.kie.client import KieClient
from video_generation.providers.kie.payloads import (
    KIE_KLING_30_API_MODEL,
    KIE_KLING_26_I2V_MODEL,
    KIE_KLING_26_T2V_MODEL,
    KIE_KLING_30_I2V_MODEL,
    KIE_KLING_30_T2V_MODEL,
    KIE_SEEDANCE_2_API_MODEL,
    KIE_SEEDANCE_2_FAST_API_MODEL,
    KIE_SEEDANCE_2_FAST_I2V_MODEL,
    KIE_SEEDANCE_2_FAST_T2V_MODEL,
    KIE_SEEDANCE_2_I2V_MODEL,
    KIE_SEEDANCE_2_T2V_MODEL,
    KIE_WAN_I2V_MODEL,
    KIE_WAN_T2V_MODEL,
)
from video_generation.schemas import VideoGenerateRequest
from video_generation.service import VideoGenerationService


KIE_T2V_MODELS = [
    KIE_WAN_T2V_MODEL,
    KIE_KLING_30_T2V_MODEL,
    KIE_KLING_26_T2V_MODEL,
    KIE_SEEDANCE_2_T2V_MODEL,
    KIE_SEEDANCE_2_FAST_T2V_MODEL,
]

KIE_I2V_MODELS = [
    KIE_WAN_I2V_MODEL,
    KIE_KLING_30_I2V_MODEL,
    KIE_KLING_26_I2V_MODEL,
    KIE_SEEDANCE_2_I2V_MODEL,
    KIE_SEEDANCE_2_FAST_I2V_MODEL,
]


class FakeKieClient:
    def __init__(self, create_response=None, query_response=None, create_error=None):
        self.create_response = create_response or {"code": 200, "data": {"taskId": "kie-task-1"}}
        self.query_response = query_response or {"code": 200, "data": {"state": "generating"}}
        self.create_error = create_error
        self.created_payloads = []

    async def create_task(self, payload):
        self.created_payloads.append(payload)
        if self.create_error:
            raise self.create_error
        return self.create_response

    async def get_task(self, task_id):
        return self.query_response


class FakeAssetRouter:
    def __init__(self):
        self.calls = []

    async def resolve(self, **kwargs):
        self.calls.append(kwargs)
        return ProviderAssetUploadResult(
            provider="kie",
            source_kind="provider_cdn",
            url="https://kie-cdn.test/input.png",
            storage="kie_cdn",
        )


class FakeServiceAdapter:
    provider = "kie"
    adapter_id = "kie:wan"

    def __init__(self):
        self.created_requests = []
        self.queried_requests = []

    async def create(self, request, capability):
        self.created_requests.append((request, capability))
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id="kie-task-1",
            status="running",
            raw_status="waiting",
            raw_response={"code": 200, "data": {"taskId": "kie-task-1", "state": "waiting"}},
        )

    async def query(self, request, capability):
        self.queried_requests.append((request, capability))
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status="succeeded",
            video_url="https://kie.test/video.mp4",
            raw_status="success",
            raw_response={
                "status": "success",
                "message": "success",
                "remoteVideoUrl": "https://kie.test/video.mp4",
                "raw": {"code": 200, "data": {"state": "success"}},
            },
        )


class KieVideoAdapterTest(unittest.IsolatedAsyncioTestCase):
    async def test_kie_create_t2v_success(self):
        client = FakeKieClient()
        adapter = KieVideoAdapter(client=client, asset_router=FakeAssetRouter())
        request = VideoCreateRequest(
            provider="kie",
            model="wan/2-7-text-to-video",
            task_type="text-to-video",
            prompt="a city at sunset",
            params={"duration": "10s", "resolution": "1080p", "aspectRatio": "9:16"},
        )

        result = await adapter.create(request, {})

        self.assertEqual(result.task_id, "kie-task-1")
        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], "wan/2-7-text-to-video")
        self.assertEqual(payload["input"]["prompt"], "a city at sunset")
        self.assertEqual(payload["input"]["duration"], 10)
        self.assertEqual(payload["input"]["resolution"], "1080p")
        self.assertEqual(payload["input"]["ratio"], "9:16")
        self.assertNotIn("aspect_ratio", payload["input"])

    async def test_kie_create_i2v_success(self):
        client = FakeKieClient()
        router = FakeAssetRouter()
        adapter = KieVideoAdapter(client=client, asset_router=router)
        request = VideoCreateRequest(
            provider="kie",
            model="wan/2-7-image-to-video",
            task_type="image-to-video",
            prompt="animate the frame",
            params={"durationSeconds": 5, "resolution": "720p"},
            inputs={
                "image:firstFrame": [
                    VideoInputAsset(kind="image", role="first_frame", url="data:image/png;base64,aW1hZ2U=")
                ]
            },
            project_dir="Z:/project",
        )

        result = await adapter.create(request, {})

        self.assertEqual(result.task_id, "kie-task-1")
        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], "wan/2-7-image-to-video")
        self.assertEqual(payload["input"]["first_frame_url"], "https://kie-cdn.test/input.png")
        self.assertNotIn("image_urls", payload["input"])
        self.assertEqual(router.calls[0]["provider"], "kie")
        self.assertEqual(router.calls[0]["purpose"], "image:firstFrame")

    async def test_kie_whitelisted_t2v_payloads(self):
        expected_api_models = {
            KIE_WAN_T2V_MODEL: KIE_WAN_T2V_MODEL,
            KIE_KLING_30_T2V_MODEL: KIE_KLING_30_API_MODEL,
            KIE_KLING_26_T2V_MODEL: KIE_KLING_26_T2V_MODEL,
            KIE_SEEDANCE_2_T2V_MODEL: KIE_SEEDANCE_2_API_MODEL,
            KIE_SEEDANCE_2_FAST_T2V_MODEL: KIE_SEEDANCE_2_FAST_API_MODEL,
        }
        expected_ratio_fields = {
            KIE_WAN_T2V_MODEL: "ratio",
            KIE_KLING_30_T2V_MODEL: "aspect_ratio",
            KIE_KLING_26_T2V_MODEL: "aspect_ratio",
            KIE_SEEDANCE_2_T2V_MODEL: "aspect_ratio",
            KIE_SEEDANCE_2_FAST_T2V_MODEL: "aspect_ratio",
        }
        for model in KIE_T2V_MODELS:
            with self.subTest(model=model):
                client = FakeKieClient()
                adapter = KieVideoAdapter(client=client, asset_router=FakeAssetRouter())
                request = VideoCreateRequest(
                    provider="kie",
                    model=model,
                    task_type="text-to-video",
                    prompt="a paper boat",
                    params={"duration": "5s", "resolution": "720p", "aspectRatio": "16:9"},
                )

                await adapter.create(request, {})

                payload = client.created_payloads[0]
                ratio_field = expected_ratio_fields[model]
                self.assertEqual(payload["model"], expected_api_models[model])
                self.assertEqual(payload["input"]["prompt"], "a paper boat")
                self.assertEqual(payload["input"]["duration"], 5)
                self.assertEqual(payload["input"]["resolution"], "720p")
                self.assertEqual(payload["input"][ratio_field], "16:9")
                self.assertNotIn("aspect_ratio" if ratio_field == "ratio" else "ratio", payload["input"])
                self.assertNotIn("first_frame_url", payload["input"])
                self.assertNotIn("image_urls", payload["input"])

    async def test_kie_kling_t2v_payloads_keep_documented_options(self):
        for model in (KIE_KLING_30_T2V_MODEL, KIE_KLING_26_T2V_MODEL):
            with self.subTest(model=model):
                client = FakeKieClient()
                adapter = KieVideoAdapter(client=client, asset_router=FakeAssetRouter())
                request = VideoCreateRequest(
                    provider="kie",
                    model=model,
                    task_type="text-to-video",
                    prompt="a paper boat",
                    params={"duration": 5, "resolution": "720p", "aspectRatio": "16:9"},
                )

                await adapter.create(request, {})

                payload_input = client.created_payloads[0]["input"]
                self.assertEqual(payload_input["duration"], 5)
                self.assertTrue(payload_input["sound"])
                if model == KIE_KLING_30_T2V_MODEL:
                    self.assertEqual(payload_input["mode"], "pro")

    async def test_kie_whitelisted_i2v_payloads_use_asset_router(self):
        expected_api_models = {
            KIE_WAN_I2V_MODEL: KIE_WAN_I2V_MODEL,
            KIE_KLING_30_I2V_MODEL: KIE_KLING_30_API_MODEL,
            KIE_KLING_26_I2V_MODEL: KIE_KLING_26_I2V_MODEL,
            KIE_SEEDANCE_2_I2V_MODEL: KIE_SEEDANCE_2_API_MODEL,
            KIE_SEEDANCE_2_FAST_I2V_MODEL: KIE_SEEDANCE_2_FAST_API_MODEL,
        }
        expected_image_fields = {
            KIE_WAN_I2V_MODEL: "first_frame_url",
            KIE_KLING_30_I2V_MODEL: "image_urls",
            KIE_KLING_26_I2V_MODEL: "image_urls",
            KIE_SEEDANCE_2_I2V_MODEL: "first_frame_url",
            KIE_SEEDANCE_2_FAST_I2V_MODEL: "first_frame_url",
        }
        for model in KIE_I2V_MODELS:
            with self.subTest(model=model):
                client = FakeKieClient()
                router = FakeAssetRouter()
                adapter = KieVideoAdapter(client=client, asset_router=router)
                request = VideoCreateRequest(
                    provider="kie",
                    model=model,
                    task_type="image-to-video",
                    prompt="animate",
                    params={"duration": "5s", "resolution": "720p"},
                    inputs={
                        "image:firstFrame": [
                            VideoInputAsset(kind="image", role="first_frame", url="https://example.test/input.png")
                        ]
                    },
                    project_dir="Z:/project",
                )

                await adapter.create(request, {})

                payload = client.created_payloads[0]
                image_field = expected_image_fields[model]
                self.assertEqual(payload["model"], expected_api_models[model])
                if image_field == "image_urls":
                    self.assertEqual(payload["input"]["image_urls"], ["https://kie-cdn.test/input.png"])
                    self.assertNotIn("first_frame_url", payload["input"])
                else:
                    self.assertEqual(payload["input"]["first_frame_url"], "https://kie-cdn.test/input.png")
                    self.assertNotIn("image_urls", payload["input"])
                self.assertEqual(len(router.calls), 1)
                self.assertEqual(router.calls[0]["provider"], "kie")
                self.assertEqual(router.calls[0]["purpose"], "image:firstFrame")

    async def test_kie_seedance_payloads_keep_documented_options(self):
        client = FakeKieClient()
        adapter = KieVideoAdapter(client=client, asset_router=FakeAssetRouter())
        request = VideoCreateRequest(
            provider="kie",
            model=KIE_SEEDANCE_2_I2V_MODEL,
            task_type="image-to-video",
            prompt="animate",
            params={
                "duration": 5,
                "resolution": "1080p",
                "aspectRatio": "9:16",
                "generateAudio": True,
                "returnLastFrame": True,
            },
            inputs={"image:firstFrame": [VideoInputAsset(kind="image", role="first_frame", url="https://example.test/input.png")]},
            project_dir="Z:/project",
        )

        await adapter.create(request, {})

        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], KIE_SEEDANCE_2_API_MODEL)
        self.assertEqual(payload["input"]["aspect_ratio"], "9:16")
        self.assertNotIn("ratio", payload["input"])
        self.assertEqual(payload["input"]["first_frame_url"], "https://kie-cdn.test/input.png")
        self.assertTrue(payload["input"]["generate_audio"])
        self.assertTrue(payload["input"]["return_last_frame"])

    async def test_kie_create_http_429(self):
        error = VideoProviderError(provider="kie", message="KIE createTask failed with HTTP 429: rate limited", category="rate_limited")
        adapter = KieVideoAdapter(client=FakeKieClient(create_error=error), asset_router=FakeAssetRouter())
        request = VideoCreateRequest(
            provider="kie",
            model="wan/2-7-text-to-video",
            task_type="text-to-video",
            prompt="test",
        )

        with self.assertRaisesRegex(VideoProviderError, "HTTP 429"):
            await adapter.create(request, {})

    async def test_kie_create_business_error(self):
        class FakeResponse:
            status_code = 200
            is_error = False
            text = "business error"

            def json(self):
                return {"code": 500, "msg": "provider rejected request"}

        class FakeAsyncClient:
            def __init__(self, timeout=None):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return None

            async def post(self, url, headers=None, json=None):
                return FakeResponse()

        from unittest.mock import patch

        adapter = KieVideoAdapter(client=KieClient(api_key="fake-key"), asset_router=FakeAssetRouter())
        request = VideoCreateRequest(
            provider="kie",
            model="wan/2-7-text-to-video",
            task_type="text-to-video",
            prompt="test",
        )

        with patch("video_generation.providers.kie.client.httpx.AsyncClient", FakeAsyncClient):
            with self.assertRaisesRegex(VideoProviderError, "provider rejected request"):
                await adapter.create(request, {})

    async def test_kie_query_running(self):
        adapter = KieVideoAdapter(
            client=FakeKieClient(query_response={"code": 200, "data": {"state": "generating"}}),
            asset_router=FakeAssetRouter(),
        )

        result = await adapter.query(VideoQueryRequest(provider="kie", model="wan/2-7-text-to-video", task_id="task-1"), {})

        self.assertEqual(result.status, "running")

    async def test_kie_query_success_result_json(self):
        adapter = KieVideoAdapter(
            client=FakeKieClient(query_response={
                "code": 200,
                "data": {"state": "success", "resultJson": '{"resultUrls":["https://x/video.mp4"]}'},
            }),
            asset_router=FakeAssetRouter(),
        )

        result = await adapter.query(VideoQueryRequest(provider="kie", model="wan/2-7-text-to-video", task_id="task-1"), {})

        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.video_url, "https://x/video.mp4")
        self.assertEqual(result.raw_response["status"], "success")
        self.assertEqual(result.raw_response["remoteVideoUrl"], "https://x/video.mp4")

    async def test_kie_query_success_fallback_video_url(self):
        adapter = KieVideoAdapter(
            client=FakeKieClient(query_response={
                "code": 200,
                "data": {"state": "completed", "resultJson": "{broken", "videoUrl": "https://x/fallback.mp4"},
            }),
            asset_router=FakeAssetRouter(),
        )

        result = await adapter.query(VideoQueryRequest(provider="kie", model="wan/2-7-text-to-video", task_id="task-1"), {})

        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.video_url, "https://x/fallback.mp4")

    async def test_kie_query_failed(self):
        adapter = KieVideoAdapter(
            client=FakeKieClient(query_response={"code": 200, "data": {"state": "fail", "failMsg": "blocked"}}),
            asset_router=FakeAssetRouter(),
        )

        result = await adapter.query(VideoQueryRequest(provider="kie", model="wan/2-7-text-to-video", task_id="task-1"), {})

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.message, "blocked")

    async def test_kie_query_unknown_status(self):
        adapter = KieVideoAdapter(
            client=FakeKieClient(query_response={"code": 200, "data": {"state": "mystery"}}),
            asset_router=FakeAssetRouter(),
        )

        result = await adapter.query(VideoQueryRequest(provider="kie", model="wan/2-7-text-to-video", task_id="task-1"), {})

        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.raw_response["status"], "running")

    async def test_service_routes_kie_create_and_query_through_adapter(self):
        fake_adapter = FakeServiceAdapter()
        stored_task = {}

        async def fake_upsert_task(project_path, task):
            stored_task["task"] = task

        async def fake_get_task(project_path, task_id):
            return stored_task.get("task")

        async def fake_download_video(project_path, remote_url, task_id):
            return "generation/video.mp4"

        request = VideoGenerateRequest(
            provider="kie",
            model="wan/2-7-text-to-video",
            videoMode="text-to-video",
            prompt="prompt",
            duration="5s",
            resolution="720p",
            aspectRatio="16:9",
        )

        with (
            patch("video_generation.service.get_video_adapter", return_value=fake_adapter),
            patch("video_generation.service.upsert_task", fake_upsert_task),
            patch("video_generation.service.get_task", fake_get_task),
            patch("video_generation.service.download_video_to_project", fake_download_video),
        ):
            service = VideoGenerationService()
            task = await service.create_task("mock-project", request)
            updated = await service.query_task("mock-project", task.id)

        self.assertEqual(task.providerTaskId, "kie-task-1")
        self.assertEqual(len(fake_adapter.created_requests), 1)
        self.assertEqual(fake_adapter.created_requests[0][0].provider, "kie")
        self.assertEqual(len(fake_adapter.queried_requests), 1)
        self.assertEqual(fake_adapter.queried_requests[0][0].task_id, "kie-task-1")
        self.assertEqual(updated.localVideoUrl, "generation/video.mp4")
        self.assertEqual(updated.outputs["videoUrl"], "generation/video.mp4")


if __name__ == "__main__":
    unittest.main()
