import unittest
from unittest.mock import AsyncMock, patch

from video_generation.adapters.errors import VideoProviderError
from video_generation.adapters.google_veo import GoogleVeoVideoAdapter
from video_generation.adapters.kling import KlingVideoAdapter
from video_generation.adapters.registry import get_video_adapter
from video_generation.adapters.types import VideoCreateRequest, VideoInputAsset, VideoQueryRequest
from video_generation.adapters.yunwu import YunwuVideoAdapter
from video_generation.adapters.yunwu_kling import YunwuKlingVideoAdapter
from video_generation.capabilities import build_model_schema_snapshot, list_video_model_capabilities
from video_generation.providers.kling import KlingVideoProvider
from video_generation.service import VideoGenerationService
from video_generation.schemas import VideoGenerateRequest


class FakeLegacyYunwuKlingProvider:
    def __init__(self):
        self.created_requests = []
        self.query_calls = []

    async def create_task(self, request):
        self.created_requests.append(request)
        return {
            "providerTaskId": "text2video:yunwu-kling-task-1",
            "status": "queued",
            "message": "submitted",
            "raw": {"mock": True, "provider": "yunwu-kling"},
        }

    async def query_task(self, provider_task_id):
        self.query_calls.append(provider_task_id)
        return {
            "status": "success",
            "remoteVideoUrl": "https://cdn.example.test/yunwu-kling.mp4",
            "message": "done",
            "raw": {"mock": True, "provider": "yunwu-kling"},
        }


class YunwuKlingVideoAdapterTest(unittest.IsolatedAsyncioTestCase):
    def _capability(self, model="kling-v3"):
        return {
            "provider": "yunwu-kling",
            "model": model,
            "adapterHints": {"adapterId": "yunwu-kling:kling", "runtime": "adapter"},
        }

    async def test_registry_returns_real_yunwu_kling_adapter(self):
        adapter = get_video_adapter("yunwu-kling")

        self.assertIsInstance(adapter, YunwuKlingVideoAdapter)
        self.assertEqual(adapter.adapter_id, "yunwu-kling:kling")
        self.assertIsInstance(get_video_adapter("yunwu"), YunwuVideoAdapter)
        self.assertIsInstance(get_video_adapter("google"), GoogleVeoVideoAdapter)
        self.assertIsInstance(get_video_adapter("kling"), KlingVideoAdapter)
        self.assertNotIsInstance(get_video_adapter("seedance_official"), YunwuKlingVideoAdapter)

    async def test_supports_provider_and_adapter_hint(self):
        adapter = YunwuKlingVideoAdapter(FakeLegacyYunwuKlingProvider())

        self.assertTrue(adapter.supports({"provider": "yunwu-kling"}))
        self.assertTrue(adapter.supports({"provider": "other", "adapterHints": {"adapterId": "yunwu-kling:kling"}}))
        self.assertFalse(adapter.supports({"provider": "kling", "adapterHints": {"adapterId": "kling:official"}}))

    async def test_build_text2video_payload_matches_legacy_yunwu_kling_fields(self):
        adapter = YunwuKlingVideoAdapter(KlingVideoProvider(provider_type="yunwu-kling"))
        request = VideoCreateRequest(
            provider="yunwu-kling",
            model="kling-v3",
            task_type="text-to-video",
            prompt="A floating lantern",
            params={
                "negativePrompt": "blur",
                "aspectRatio": "9:16",
                "duration": "7s",
                "qualityMode": "pro",
                "generateAudio": True,
                "customParams": {
                    "kling": {
                        "cfgScale": 0.6,
                        "cameraControl": {"type": "simple", "axis": "tilt", "value": -3},
                    }
                },
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual(payload["model_name"], "kling-v3")
        self.assertEqual(payload["prompt"], "A floating lantern")
        self.assertEqual(payload["negative_prompt"], "blur")
        self.assertEqual(payload["aspect_ratio"], "9:16")
        self.assertEqual(payload["duration"], "7")
        self.assertEqual(payload["mode"], "pro")
        self.assertEqual(payload["sound"], "on")
        self.assertEqual(payload["watermark_info"], {"enabled": False})
        self.assertEqual(payload["cfg_scale"], 0.6)
        self.assertEqual(payload["camera_control"], {"type": "simple", "config": {"tilt": -3}})
        self.assertFalse(payload["multi_shot"])

    async def test_build_image2video_payload_preserves_first_and_last_frame_mapping(self):
        adapter = YunwuKlingVideoAdapter(KlingVideoProvider(provider_type="yunwu-kling"))
        request = VideoCreateRequest(
            provider="yunwu-kling",
            model="kling-v3",
            task_type="image-to-video",
            prompt="Animate the image",
            params={"duration": "10s", "qualityMode": "std", "generateAudio": False},
            inputs={
                "image:firstFrame": [
                    VideoInputAsset(kind="image", role="first_frame", url="https://cdn.example.test/start.png")
                ],
                "image:lastFrame": [
                    VideoInputAsset(kind="image", role="last_frame", url="https://cdn.example.test/end.png")
                ],
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual(payload["image"], "https://cdn.example.test/start.png")
        self.assertEqual(payload["image_tail"], "https://cdn.example.test/end.png")
        self.assertNotIn("aspect_ratio", payload)
        self.assertEqual(payload["duration"], "10")
        self.assertEqual(payload["mode"], "std")
        self.assertEqual(payload["sound"], "off")

    async def test_build_multi_shot_payload_preserves_multi_prompt(self):
        adapter = YunwuKlingVideoAdapter(KlingVideoProvider(provider_type="yunwu-kling"))
        request = VideoCreateRequest(
            provider="yunwu-kling",
            model="kling-v3",
            task_type="text-to-video",
            prompt="unused",
            params={
                "customParams": {
                    "kling": {
                        "shotMode": "customize",
                        "multiPrompt": [
                            {"prompt": "Open", "duration": "2"},
                            {"prompt": "Detail", "duration": "3"},
                        ],
                    }
                }
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertTrue(payload["multi_shot"])
        self.assertEqual(payload["shot_type"], "customize")
        self.assertEqual(payload["prompt"], "")
        self.assertEqual(payload["duration"], "5")
        self.assertEqual(payload["multi_prompt"], [{"prompt": "Open", "duration": "2"}, {"prompt": "Detail", "duration": "3"}])

    async def test_build_omni_payload_preserves_legacy_yunwu_kling_payload(self):
        adapter = YunwuKlingVideoAdapter(KlingVideoProvider(provider_type="yunwu-kling"))
        request = VideoCreateRequest(
            provider="yunwu-kling",
            model="kling-v3-omni",
            task_type="omni-video",
            prompt="",
            params={
                "aspectRatio": "1:1",
                "duration": "5s",
                "generateAudio": False,
                "customParams": {
                    "kling": {
                        "omniParams": {
                            "prompt": "Move @image_1 around @element_1",
                            "images": [{"url": "https://cdn.example.test/ref.png", "role": "reference"}],
                            "elements": [{"elementId": "123"}],
                        }
                    }
                },
            },
        )

        payload = await adapter.build_create_payload(request, self._capability(model="kling-v3-omni"))

        self.assertEqual(payload["model_name"], "kling-v3-omni")
        self.assertEqual(payload["prompt"], "Move <<<image_1>>> around <<<element_1>>>")
        self.assertEqual(payload["image_list"], [{"image_url": "https://cdn.example.test/ref.png"}])
        self.assertEqual(payload["element_list"], [{"element_id": 123}])
        self.assertEqual(payload["aspect_ratio"], "1:1")
        self.assertEqual(payload["sound"], "off")
        self.assertFalse(payload["multi_shot"])

    async def test_create_and_query_reuse_yunwu_kling_provider_without_network(self):
        legacy = FakeLegacyYunwuKlingProvider()
        adapter = YunwuKlingVideoAdapter(legacy)

        created = await adapter.create(
            VideoCreateRequest(provider="yunwu-kling", model="kling-v3", task_type="text-to-video", prompt="hello"),
            self._capability(),
        )
        queried = await adapter.query(
            VideoQueryRequest(provider="yunwu-kling", model="kling-v3", task_id=created.task_id),
            self._capability(),
        )

        self.assertEqual(created.task_id, "text2video:yunwu-kling-task-1")
        self.assertEqual(created.status, "queued")
        self.assertEqual(legacy.created_requests[0].provider, "yunwu-kling")
        self.assertEqual(queried.status, "succeeded")
        self.assertEqual(queried.video_url, "https://cdn.example.test/yunwu-kling.mp4")
        self.assertEqual(legacy.query_calls, ["text2video:yunwu-kling-task-1"])

    async def test_provider_errors_are_wrapped_and_classified(self):
        class FailingProvider:
            async def create_task(self, request):
                raise ValueError("invalid token")

        adapter = YunwuKlingVideoAdapter(FailingProvider())

        with self.assertRaises(VideoProviderError) as context:
            await adapter.create(
                VideoCreateRequest(provider="yunwu-kling", model="kling-v3", task_type="text-to-video", prompt="x"),
                self._capability(),
            )

        self.assertEqual(context.exception.provider, "yunwu-kling")
        self.assertEqual(context.exception.category, "auth_error")

    async def test_service_routes_yunwu_kling_through_adapter(self):
        service = VideoGenerationService(yunwu_api_key="mock")
        fake_legacy = FakeLegacyYunwuKlingProvider()
        service.providers["yunwu-kling"] = fake_legacy

        request = VideoGenerateRequest(
            projectPath="Z:/tmp/project",
            provider="yunwu-kling",
            model="kling-v3",
            videoMode="text-to-video",
            prompt="service route",
        )

        with patch("video_generation.service.upsert_task", new_callable=AsyncMock) as upsert:
            task = await service.create_task("Z:/tmp/project", request)

        self.assertEqual(task.provider, "yunwu-kling")
        self.assertEqual(task.providerTaskId, "text2video:yunwu-kling-task-1")
        self.assertEqual(len(fake_legacy.created_requests), 1)
        upsert.assert_awaited_once()

    async def test_seedance_does_not_use_yunwu_kling_adapter(self):
        self.assertNotIsInstance(get_video_adapter("seedance_official"), YunwuKlingVideoAdapter)

    async def test_adapter_import_and_init_do_not_create_client_or_read_secret(self):
        with patch("video_generation.providers.kling.provider.YunwuKlingClient") as client:
            YunwuKlingVideoAdapter(KlingVideoProvider(provider_type="yunwu-kling"))

        client.assert_not_called()

    async def test_adapter_hints_do_not_enter_schema_snapshot(self):
        capabilities = [capability for capability in list_video_model_capabilities() if capability["provider"] == "yunwu-kling"]

        self.assertTrue(capabilities)
        for capability in capabilities:
            self.assertEqual(capability["adapterHints"]["adapterId"], "yunwu-kling:kling")
            self.assertEqual(capability["adapterHints"]["runtime"], "adapter")
            self.assertNotIn("adapterHints", build_model_schema_snapshot(capability))


if __name__ == "__main__":
    unittest.main()
