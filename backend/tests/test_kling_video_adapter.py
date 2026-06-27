import unittest
from unittest.mock import AsyncMock, patch

from video_generation.adapters.errors import VideoProviderError
from video_generation.adapters.kling import KlingVideoAdapter
from video_generation.adapters.registry import get_video_adapter
from video_generation.adapters.types import VideoCreateRequest, VideoCreateResult, VideoInputAsset, VideoQueryRequest
from video_generation.adapters.yunwu_kling import YunwuKlingVideoAdapter
from video_generation.capabilities import build_model_schema_snapshot, list_video_model_capabilities
from video_generation.providers.kling import KlingVideoProvider
from video_generation.service import VideoGenerationService
from video_generation.schemas import VideoGenerateRequest, VideoTask


class FakeLegacyKlingProvider:
    def __init__(self):
        self.created_requests = []
        self.query_calls = []

    async def create_task(self, request):
        self.created_requests.append(request)
        return {
            "providerTaskId": "text2video:task-1",
            "status": "queued",
            "message": "submitted",
            "raw": {"mock": True},
        }

    async def query_task(self, provider_task_id):
        self.query_calls.append(provider_task_id)
        return {
            "status": "success",
            "remoteVideoUrl": "https://cdn.example.test/video.mp4",
            "message": "done",
            "raw": {"mock": True},
        }


class CaptureCreateAdapter:
    def __init__(self, bridge):
        self.bridge = bridge
        self.bridge_calls = 0
        self.created_requests = []

    def create_request_from_generate_request(self, request):
        self.bridge_calls += 1
        return self.bridge.create_request_from_generate_request(request)

    async def create(self, request, capability):
        self.created_requests.append(request)
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id="mock-task-1",
            status="queued",
        )


class KlingVideoAdapterTest(unittest.IsolatedAsyncioTestCase):
    def _capability(self, model="kling-v3"):
        return {
            "provider": "kling",
            "model": model,
            "adapterHints": {"adapterId": "kling:official", "runtime": "adapter"},
        }

    async def _capture_standard_create_request(self, request):
        bridge = (
            YunwuKlingVideoAdapter(FakeLegacyKlingProvider())
            if request.provider == "yunwu-kling"
            else KlingVideoAdapter(FakeLegacyKlingProvider())
        )
        adapter = CaptureCreateAdapter(bridge)
        service = VideoGenerationService(yunwu_api_key="mock")
        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.upsert_task", new_callable=AsyncMock),
        ):
            await service.create_task("mock-project", request)

        self.assertEqual(len(adapter.created_requests), 1)
        self.assertEqual(adapter.bridge_calls, 1)
        return adapter.created_requests[0]

    async def test_standard_bridge_rejects_omni_mode(self):
        adapter = KlingVideoAdapter(FakeLegacyKlingProvider())
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
        )

        with self.assertRaisesRegex(ValueError, "does not support mode: omni-video"):
            adapter.create_request_from_generate_request(request)

    async def test_registry_returns_real_kling_adapter(self):
        adapter = get_video_adapter("kling")

        self.assertIsInstance(adapter, KlingVideoAdapter)
        self.assertEqual(adapter.adapter_id, "kling:official")
        self.assertIsInstance(get_video_adapter("yunwu-kling"), YunwuKlingVideoAdapter)
        self.assertNotIsInstance(get_video_adapter("seedance_official"), KlingVideoAdapter)

    async def test_supports_provider_and_adapter_hint(self):
        adapter = KlingVideoAdapter(FakeLegacyKlingProvider())

        self.assertTrue(adapter.supports({"provider": "kling"}))
        self.assertTrue(adapter.supports({"provider": "other", "adapterHints": {"adapterId": "kling:official"}}))
        self.assertFalse(adapter.supports({"provider": "google"}))

    async def test_standard_t2v_create_request_matches_historical_field_contract(self):
        for model in ("kling-v2-6", "kling-v3"):
            with self.subTest(model=model):
                custom_params = {"kling": {"shotMode": "single", "cfgScale": 0.6}, "sentinel": "kept"}
                request = VideoGenerateRequest(
                    provider="kling",
                    model=model,
                    videoMode="text-to-video",
                    prompt="A mock comet over water",
                    negativePrompt="blur",
                    aspectRatio="9:16",
                    duration="7s",
                    durationSeconds=7,
                    resolution="1080p",
                    qualityMode="pro",
                    generateAudio=True,
                    seed=42,
                    numberOfVideos=2,
                    customParams=custom_params,
                )

                create_request = await self._capture_standard_create_request(request)

                self.assertEqual(create_request.provider, "kling")
                self.assertEqual(create_request.model, model)
                self.assertEqual(create_request.task_type, "text-to-video")
                self.assertEqual(create_request.prompt, "A mock comet over water")
                self.assertEqual(create_request.project_dir, "mock-project")
                self.assertEqual(create_request.inputs, {})
                self.assertEqual(create_request.params, {
                    "negativePrompt": "blur",
                    "aspectRatio": "9:16",
                    "duration": "7s",
                    "durationSeconds": 7,
                    "qualityMode": "pro",
                    "generateAudio": True,
                    "customParams": custom_params,
                })

    async def test_standard_i2v_create_request_matches_historical_field_and_input_contract(self):
        for model in ("kling-v2-6", "kling-v3"):
            with self.subTest(model=model):
                custom_params = {"kling": {"shotMode": "single"}}
                request = VideoGenerateRequest(
                    provider="kling",
                    model=model,
                    videoMode="image-to-video",
                    prompt="Animate mock frames",
                    negativePrompt="flicker",
                    aspectRatio="16:9",
                    duration="10s",
                    durationSeconds=10,
                    resolution="720p",
                    qualityMode="std",
                    generateAudio=False,
                    seed=9,
                    numberOfVideos=3,
                    images=["mock://first.png", "mock://ignored.png"],
                    endImage="mock://last.png",
                    customParams=custom_params,
                )

                create_request = await self._capture_standard_create_request(request)

                self.assertEqual(create_request.provider, "kling")
                self.assertEqual(create_request.model, model)
                self.assertEqual(create_request.task_type, "image-to-video")
                self.assertEqual(create_request.prompt, "Animate mock frames")
                self.assertEqual(create_request.project_dir, "mock-project")
                self.assertEqual(create_request.params, {
                    "negativePrompt": "flicker",
                    "aspectRatio": "16:9",
                    "duration": "10s",
                    "durationSeconds": 10,
                    "qualityMode": "std",
                    "generateAudio": False,
                    "customParams": custom_params,
                })
                self.assertEqual(list(create_request.inputs), ["image:firstFrame", "image:lastFrame"])
                self.assertEqual(create_request.inputs, {
                    "image:firstFrame": [
                        VideoInputAsset(
                            kind="image",
                            role="first_frame",
                            url="mock://first.png",
                            handle_id="image:firstFrame",
                        ),
                    ],
                    "image:lastFrame": [
                        VideoInputAsset(
                            kind="image",
                            role="last_frame",
                            url="mock://last.png",
                            handle_id="image:lastFrame",
                        ),
                    ],
                })
                self.assertNotIn("image:references", create_request.inputs)

    async def test_yunwu_kling_alias_uses_same_standard_historical_contract(self):
        custom_params = {"kling": {"shotMode": "single"}}
        request = VideoGenerateRequest(
            provider="yunwu-kling",
            model="kling-v3",
            videoMode="text-to-video",
            prompt="Alias contract",
            negativePrompt="noise",
            aspectRatio="1:1",
            duration="5s",
            durationSeconds=5,
            resolution="1080p",
            qualityMode="pro",
            generateAudio=True,
            seed=17,
            numberOfVideos=4,
            customParams=custom_params,
        )

        create_request = await self._capture_standard_create_request(request)

        self.assertEqual(create_request.provider, "yunwu-kling")
        self.assertEqual(create_request.model, "kling-v3")
        self.assertEqual(create_request.task_type, "text-to-video")
        self.assertEqual(create_request.prompt, "Alias contract")
        self.assertEqual(create_request.inputs, {})
        self.assertEqual(create_request.params, {
            "negativePrompt": "noise",
            "aspectRatio": "1:1",
            "duration": "5s",
            "durationSeconds": 5,
            "qualityMode": "pro",
            "generateAudio": True,
            "customParams": custom_params,
        })

    async def test_build_text2video_payload_matches_legacy_fields(self):
        adapter = KlingVideoAdapter(KlingVideoProvider(provider_type="kling"))
        request = VideoCreateRequest(
            provider="kling",
            model="kling-v3",
            task_type="text-to-video",
            prompt="A lantern floating over water",
            params={
                "negativePrompt": "blur",
                "aspectRatio": "9:16",
                "duration": "7s",
                "qualityMode": "pro",
                "generateAudio": True,
                "customParams": {
                    "kling": {
                        "cfgScale": 0.7,
                        "cameraControl": {"type": "simple", "axis": "pan", "value": 4},
                    }
                },
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual(payload["model_name"], "kling-v3")
        self.assertEqual(payload["prompt"], "A lantern floating over water")
        self.assertEqual(payload["negative_prompt"], "blur")
        self.assertEqual(payload["aspect_ratio"], "9:16")
        self.assertEqual(payload["duration"], "7")
        self.assertEqual(payload["mode"], "pro")
        self.assertEqual(payload["sound"], "on")
        self.assertEqual(payload["watermark_info"], {"enabled": False})
        self.assertEqual(payload["cfg_scale"], 0.7)
        self.assertEqual(payload["camera_control"], {"type": "simple", "config": {"pan": 4}})
        self.assertFalse(payload["multi_shot"])

    async def test_build_image2video_payload_preserves_first_and_last_frame_mapping(self):
        adapter = KlingVideoAdapter(KlingVideoProvider(provider_type="kling"))
        request = VideoCreateRequest(
            provider="kling",
            model="kling-v3",
            task_type="image-to-video",
            prompt="Animate the scene",
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

    async def test_standard_quality_and_audio_params_reach_payload_for_kling_variants(self):
        adapter = KlingVideoAdapter(KlingVideoProvider(provider_type="kling"))
        for model in ("kling-v2-6", "kling-v3"):
            with self.subTest(model=model):
                request = VideoCreateRequest(
                    provider="kling",
                    model=model,
                    task_type="text-to-video",
                    prompt="A comet over the ocean",
                    params={"duration": "5s", "qualityMode": "pro", "generateAudio": True},
                )

                payload = await adapter.build_create_payload(request, self._capability(model=model))

                self.assertEqual(payload["model_name"], model)
                self.assertEqual(payload["duration"], "5")
                self.assertEqual(payload["mode"], "pro")
                self.assertEqual(payload["sound"], "on")

    async def test_build_multi_shot_payload_preserves_multi_prompt(self):
        adapter = KlingVideoAdapter(KlingVideoProvider(provider_type="kling"))
        request = VideoCreateRequest(
            provider="kling",
            model="kling-v3",
            task_type="text-to-video",
            prompt="unused when customize",
            params={
                "customParams": {
                    "kling": {
                        "shotMode": "customize",
                        "multiPrompt": [
                            {"prompt": "Wide opening", "duration": "2"},
                            {"prompt": "Close detail", "duration": "3"},
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
        self.assertEqual(
            payload["multi_prompt"],
            [{"prompt": "Wide opening", "duration": "2"}, {"prompt": "Close detail", "duration": "3"}],
        )

    async def test_build_omni_payload_preserves_elements_and_resolved_prompt(self):
        adapter = KlingVideoAdapter(KlingVideoProvider(provider_type="kling"))
        request = VideoCreateRequest(
            provider="kling",
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
                            "images": [{"index": 0, "role": "reference"}],
                            "elements": [{"elementId": "123"}],
                        }
                    }
                },
            },
            inputs={
                "image:references": [VideoInputAsset(kind="image", role="reference", url="https://cdn.example.test/ref.png")],
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

    async def test_create_and_query_reuse_legacy_provider_without_network(self):
        legacy = FakeLegacyKlingProvider()
        adapter = KlingVideoAdapter(legacy)
        create_request = VideoCreateRequest(
            provider="kling",
            model="kling-v3",
            task_type="text-to-video",
            prompt="hello",
        )

        created = await adapter.create(create_request, self._capability())
        queried = await adapter.query(
            VideoQueryRequest(provider="kling", model="kling-v3", task_id=created.task_id),
            self._capability(),
        )

        self.assertEqual(created.task_id, "text2video:task-1")
        self.assertEqual(created.status, "queued")
        self.assertEqual(legacy.created_requests[0].provider, "kling")
        self.assertEqual(queried.status, "succeeded")
        self.assertEqual(queried.video_url, "https://cdn.example.test/video.mp4")
        self.assertEqual(legacy.query_calls, ["text2video:task-1"])

    async def test_provider_errors_are_wrapped_and_classified(self):
        class FailingProvider:
            async def create_task(self, request):
                raise ValueError("Kling code 1000: invalid token")

        adapter = KlingVideoAdapter(FailingProvider())

        with self.assertRaises(VideoProviderError) as context:
            await adapter.create(
                VideoCreateRequest(provider="kling", model="kling-v3", task_type="text-to-video", prompt="x"),
                self._capability(),
            )

        self.assertEqual(context.exception.category, "auth_error")
        self.assertFalse(context.exception.retryable)

    async def test_service_routes_only_official_kling_through_adapter(self):
        service = VideoGenerationService(yunwu_api_key="mock")
        fake_legacy = FakeLegacyKlingProvider()
        service.providers["kling"] = fake_legacy

        request = VideoGenerateRequest(
            projectPath="Z:/tmp/project",
            provider="kling",
            model="kling-v3",
            videoMode="text-to-video",
            prompt="service route",
        )

        with patch("video_generation.service.upsert_task", new_callable=AsyncMock) as upsert:
            task = await service.create_task("Z:/tmp/project", request)

        self.assertEqual(task.provider, "kling")
        self.assertEqual(task.providerTaskId, "text2video:task-1")
        self.assertEqual(len(fake_legacy.created_requests), 1)
        upsert.assert_awaited_once()

    async def test_service_leaves_yunwu_kling_on_legacy_provider(self):
        service = VideoGenerationService(yunwu_api_key="mock")
        fake_yunwu_kling = FakeLegacyKlingProvider()
        service.providers["yunwu-kling"] = fake_yunwu_kling

        request = VideoGenerateRequest(
            projectPath="Z:/tmp/project",
            provider="yunwu-kling",
            model="kling-v3",
            videoMode="text-to-video",
            prompt="legacy route",
        )

        with patch("video_generation.service.upsert_task", new_callable=AsyncMock):
            task = await service.create_task("Z:/tmp/project", request)

        self.assertEqual(task.provider, "yunwu-kling")
        self.assertEqual(len(fake_yunwu_kling.created_requests), 1)

    async def test_adapter_import_and_init_do_not_create_client_or_jwt(self):
        with patch("video_generation.providers.kling.provider.KlingOfficialClient") as client:
            KlingVideoAdapter(KlingVideoProvider(provider_type="kling"))

        client.assert_not_called()

    async def test_adapter_hints_do_not_enter_schema_snapshot(self):
        kling_capabilities = [capability for capability in list_video_model_capabilities() if capability["provider"] == "kling"]

        self.assertTrue(kling_capabilities)
        for capability in kling_capabilities:
            self.assertEqual(capability["adapterHints"]["adapterId"], "kling:official")
            self.assertEqual(capability["adapterHints"]["runtime"], "adapter")
            self.assertNotIn("adapterHints", build_model_schema_snapshot(capability))


if __name__ == "__main__":
    unittest.main()
