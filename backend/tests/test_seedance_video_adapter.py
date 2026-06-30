import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from video_generation.adapters.errors import VideoProviderError
from video_generation.adapters.google_veo import GoogleVeoVideoAdapter
from video_generation.adapters.kling import KlingVideoAdapter
from video_generation.adapters.registry import get_video_adapter
from video_generation.adapters.seedance import SeedanceOfficialVideoAdapter
from video_generation.adapters.types import VideoCreateRequest, VideoCreateResult, VideoInputAsset, VideoQueryRequest
from video_generation.adapters.yunwu import YunwuVideoAdapter
from video_generation.adapters.yunwu_kling import YunwuKlingVideoAdapter
from video_generation.capabilities import build_model_schema_snapshot, list_video_model_capabilities
from video_generation.providers.seedance_official.payloads import SeedancePayloadBuilder
from video_generation.providers.seedance_official.provider import SeedanceOfficialProvider
from video_generation.schemas import VideoGenerateRequest
from video_generation.service import VideoGenerationService


class PassthroughPublicAssets:
    def __init__(self):
        self.calls = []

    async def ensure_public_url(self, value, project_path=None, storage_provider=None):
        self.calls.append({
            "value": value,
            "project_path": project_path,
            "storage_provider": storage_provider,
        })
        if str(value).startswith(("http://", "https://")):
            return str(value)
        return f"https://public.test/{Path(str(value)).name}"


class FakeSeedanceClient:
    def __init__(self):
        self.payloads = []
        self.query_response = {
            "status": "succeeded",
            "content": {
                "video_url": "https://seedance.test/video.mp4",
                "last_frame_url": "https://seedance.test/last.png",
            },
        }

    async def create_task(self, payload):
        self.payloads.append(payload)
        return {"id": "seedance-task-1", "status": "queued", "message": "queued"}

    async def query_task(self, task_id):
        return self.query_response


class FakeLegacySeedanceProvider:
    def __init__(self):
        self.created_requests = []
        self.query_calls = []

    async def create_task(self, request):
        self.created_requests.append(request)
        return {
            "providerTaskId": "seedance-task-1",
            "status": "queued",
            "message": "queued",
            "raw": {"mock": True, "provider": "seedance_official"},
        }

    async def query_task(self, provider_task_id):
        self.query_calls.append(provider_task_id)
        return {
            "status": "success",
            "remoteVideoUrl": "https://seedance.test/video.mp4",
            "lastFrameRemoteUrl": "https://seedance.test/last.png",
            "message": "done",
            "raw": {"mock": True, "provider": "seedance_official"},
        }


class CaptureSeedanceCreateAdapter:
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
            task_id="mock-seedance-task-1",
            status="queued",
        )


class SeedanceOfficialVideoAdapterTest(unittest.IsolatedAsyncioTestCase):
    def _provider(self, public_assets=None, client=None):
        return SeedanceOfficialProvider(
            client=client or FakeSeedanceClient(),
            payload_builder=SeedancePayloadBuilder(public_assets or PassthroughPublicAssets()),
        )

    def _capability(self, model="doubao-seedance-2-0-260128"):
        return {
            "provider": "seedance_official",
            "model": model,
            "adapterHints": {"adapterId": "seedance:official", "runtime": "adapter"},
        }

    async def _capture_service_create_request(self, request):
        adapter = CaptureSeedanceCreateAdapter(
            SeedanceOfficialVideoAdapter(FakeLegacySeedanceProvider())
        )
        service = VideoGenerationService(yunwu_api_key="mock")
        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.upsert_task", new_callable=AsyncMock),
        ):
            await service.create_task("mock-project", request)

        self.assertEqual(len(adapter.created_requests), 1)
        self.assertEqual(adapter.bridge_calls, 1)
        return adapter.created_requests[0]

    async def test_seedance_bridge_rejects_unknown_mode(self):
        adapter = SeedanceOfficialVideoAdapter(FakeLegacySeedanceProvider())
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="unsupported-mode",
            prompt="",
        )

        with self.assertRaisesRegex(ValueError, "does not support mode: unsupported-mode"):
            adapter.create_request_from_generate_request(request)

    async def test_seedance_frame_bridge_round_trips_historical_legacy_asset_locations(self):
        adapter = SeedanceOfficialVideoAdapter(FakeLegacySeedanceProvider())
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="frame",
            prompt="Round-trip frame assets",
            negativePrompt="not historically mapped",
            numberOfVideos=2,
            images=["input/seedance/first.png"],
            endImage="input/seedance/last.png",
            watermark=True,
            cfgScale=0.75,
            motionStrength=0.8,
            fps=30,
        )

        create_request = adapter.create_request_from_generate_request(request)
        legacy_request = adapter._to_legacy_request(create_request)

        self.assertEqual(
            request.images[0],
            create_request.inputs["image:firstFrame"][0].url,
        )
        self.assertEqual(request.images[0], legacy_request.images[0])
        self.assertEqual(
            request.endImage,
            create_request.inputs["image:lastFrame"][0].url,
        )
        self.assertEqual(request.endImage, legacy_request.endImage)
        self.assertEqual(legacy_request.videoMode, request.videoMode)
        self.assertEqual(legacy_request.provider, request.provider)
        self.assertEqual(legacy_request.model, request.model)
        self.assertIsNone(legacy_request.negativePrompt)
        self.assertIsNone(legacy_request.numberOfVideos)
        for field in ("watermark", "cfgScale", "motionStrength", "fps"):
            self.assertFalse(hasattr(legacy_request, field))

    async def test_seedance_multimodal_bridge_round_trips_historical_legacy_asset_locations(self):
        adapter = SeedanceOfficialVideoAdapter(FakeLegacySeedanceProvider())
        images = [
            "input/seedance/reference-0.png",
            "input/seedance/reference-1.png",
            "input/seedance/reference-0.png",
        ]
        videos = [
            "input/seedance/reference-0.mp4",
            "input/seedance/reference-1.mp4",
            "input/seedance/reference-0.mp4",
        ]
        audios = [
            "input/seedance/reference-0.mp3",
            "input/seedance/reference-1.mp3",
            "input/seedance/reference-0.mp3",
        ]
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="multimodal-reference",
            prompt="Keep @image_1, @video_1, and @audio_1 unchanged",
            images=images,
            customParams={
                "seedance": {
                    "videos": videos,
                    "audios": audios,
                    "motionMode": "cinematic",
                    "referenceDescriptors": [
                        {"kind": "image", "index": 0, "role": "reference"},
                        {"kind": "video", "index": 1, "role": "reference"},
                        {"kind": "audio", "index": 2, "role": "reference"},
                    ],
                },
                "sentinel": "kept",
            },
        )

        create_request = adapter.create_request_from_generate_request(request)
        legacy_request = adapter._to_legacy_request(create_request)

        canonical_images = [asset.url for asset in create_request.inputs["image:references"]]
        canonical_videos = [asset.url for asset in create_request.inputs["video:references"]]
        canonical_audios = [asset.url for asset in create_request.inputs["audio:references"]]
        legacy_seedance = legacy_request.customParams["seedance"]

        self.assertEqual(request.images, canonical_images)
        self.assertEqual(request.images, legacy_seedance["images"])
        self.assertEqual(videos, canonical_videos)
        self.assertEqual(videos, legacy_seedance["videos"])
        self.assertEqual(audios, canonical_audios)
        self.assertEqual(audios, legacy_seedance["audios"])
        for original, canonical, legacy in (
            (images, canonical_images, legacy_seedance["images"]),
            (videos, canonical_videos, legacy_seedance["videos"]),
            (audios, canonical_audios, legacy_seedance["audios"]),
        ):
            self.assertEqual(len(original), len(canonical))
            self.assertEqual(len(original), len(legacy))
            self.assertEqual(original[0], canonical[0])
            self.assertEqual(original[0], canonical[2])
            self.assertEqual(original[0], legacy[0])
            self.assertEqual(original[0], legacy[2])
        self.assertEqual([asset.kind for asset in create_request.inputs["image:references"]], ["image"] * 3)
        self.assertEqual([asset.kind for asset in create_request.inputs["video:references"]], ["video"] * 3)
        self.assertEqual([asset.kind for asset in create_request.inputs["audio:references"]], ["audio"] * 3)
        self.assertEqual(create_request.prompt, request.prompt)
        self.assertEqual(legacy_request.prompt, request.prompt)
        self.assertEqual(legacy_seedance["motionMode"], "cinematic")
        self.assertEqual(legacy_request.customParams["sentinel"], "kept")
        self.assertTrue(all(value.startswith("input/seedance/") for value in images + videos + audios))

    async def test_seedance_frame_service_request_matches_historical_mapping_contract(self):
        custom_params = {
            "seedance": {"cameraFixed": True},
            "sentinel": "kept",
        }
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="frame",
            prompt="Animate the historical frame pair",
            negativePrompt="not historically mapped",
            aspectRatio="16:9",
            duration="7s",
            durationSeconds=7,
            resolution="1080p",
            generateAudio=False,
            returnLastFrame=True,
            publicAssetStorage="r2",
            seed=123,
            numberOfVideos=2,
            images=["input/seedance/first.png"],
            endImage="input/seedance/last.png",
            customParams=custom_params,
            watermark=True,
            cfgScale=0.75,
            motionStrength=0.8,
            fps=30,
        )

        create_request = await self._capture_service_create_request(request)

        self.assertEqual(create_request.provider, "seedance_official")
        self.assertEqual(create_request.model, "doubao-seedance-2-0-260128")
        self.assertEqual(create_request.task_type, "frame")
        self.assertEqual(create_request.prompt, "Animate the historical frame pair")
        self.assertEqual(create_request.project_dir, "mock-project")
        self.assertEqual(create_request.params, {
            "aspectRatio": "16:9",
            "duration": "7s",
            "durationSeconds": 7,
            "resolution": "1080p",
            "generateAudio": False,
            "returnLastFrame": True,
            "publicAssetStorage": "r2",
            "seed": 123,
            "customParams": custom_params,
        })
        self.assertEqual(create_request.inputs, {
            "image:firstFrame": [
                VideoInputAsset(
                    kind="image",
                    role="first_frame",
                    url="input/seedance/first.png",
                    handle_id="image:firstFrame",
                ),
            ],
            "image:lastFrame": [
                VideoInputAsset(
                    kind="image",
                    role="last_frame",
                    url="input/seedance/last.png",
                    handle_id="image:lastFrame",
                ),
            ],
        })
        for field in ("negativePrompt", "numberOfVideos", "watermark", "cfgScale", "motionStrength", "fps"):
            self.assertNotIn(field, create_request.params)

    async def test_seedance_reference_service_request_matches_historical_multimodal_contract(self):
        image_references = [
            "input/seedance/reference-1.png",
            "input/seedance/reference-0.png",
            "input/seedance/reference-1.png",
        ]
        video_references = [
            "input/seedance/reference-1.mp4",
            "input/seedance/reference-0.mp4",
            "input/seedance/reference-1.mp4",
        ]
        audio_references = [
            "input/seedance/reference-1.mp3",
            "input/seedance/reference-0.mp3",
            "input/seedance/reference-1.mp3",
        ]
        custom_params = {
            "seedance": {
                "videos": video_references,
                "audios": audio_references,
                "referenceDescriptors": [
                    {"kind": "image", "index": 1, "role": "reference"},
                    {"kind": "video", "index": 0, "role": "reference"},
                    {"kind": "audio", "index": 2, "role": "reference"},
                ],
                "motionMode": "cinematic",
            },
            "sentinel": "kept",
        }
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="multimodal-reference",
            prompt="Use safe multimodal references",
            negativePrompt="not historically mapped",
            aspectRatio="adaptive",
            duration="6s",
            durationSeconds=6,
            resolution="720p",
            generateAudio=True,
            returnLastFrame=False,
            publicAssetStorage="tos",
            seed=456,
            numberOfVideos=3,
            images=image_references,
            customParams=custom_params,
            watermark=True,
            cfgScale=0.5,
            motionStrength=0.6,
            fps=24,
        )

        create_request = await self._capture_service_create_request(request)

        self.assertEqual(create_request.provider, "seedance_official")
        self.assertEqual(create_request.model, "doubao-seedance-2-0-260128")
        self.assertEqual(create_request.task_type, "multimodal-reference")
        self.assertEqual(create_request.prompt, "Use safe multimodal references")
        self.assertEqual(create_request.project_dir, "mock-project")
        self.assertEqual(create_request.params, {
            "aspectRatio": "adaptive",
            "duration": "6s",
            "durationSeconds": 6,
            "resolution": "720p",
            "generateAudio": True,
            "returnLastFrame": False,
            "publicAssetStorage": "tos",
            "seed": 456,
            "customParams": custom_params,
        })
        self.assertEqual(create_request.inputs, {
            "image:references": [
                VideoInputAsset(kind="image", role="reference", url="input/seedance/reference-1.png", handle_id="image:references"),
                VideoInputAsset(kind="image", role="reference", url="input/seedance/reference-0.png", handle_id="image:references"),
                VideoInputAsset(kind="image", role="reference", url="input/seedance/reference-1.png", handle_id="image:references"),
            ],
            "video:references": [
                VideoInputAsset(kind="video", role="reference", url="input/seedance/reference-1.mp4", handle_id="video:references"),
                VideoInputAsset(kind="video", role="reference", url="input/seedance/reference-0.mp4", handle_id="video:references"),
                VideoInputAsset(kind="video", role="reference", url="input/seedance/reference-1.mp4", handle_id="video:references"),
            ],
            "audio:references": [
                VideoInputAsset(kind="audio", role="reference", url="input/seedance/reference-1.mp3", handle_id="audio:references"),
                VideoInputAsset(kind="audio", role="reference", url="input/seedance/reference-0.mp3", handle_id="audio:references"),
                VideoInputAsset(kind="audio", role="reference", url="input/seedance/reference-1.mp3", handle_id="audio:references"),
            ],
        })
        for field in ("negativePrompt", "numberOfVideos", "watermark", "cfgScale", "motionStrength", "fps"):
            self.assertNotIn(field, create_request.params)

    async def test_registry_returns_real_seedance_adapter(self):
        adapter = get_video_adapter("seedance_official")

        self.assertIsInstance(adapter, SeedanceOfficialVideoAdapter)
        self.assertEqual(adapter.adapter_id, "seedance:official")
        self.assertIsInstance(get_video_adapter("yunwu"), YunwuVideoAdapter)
        self.assertIsInstance(get_video_adapter("google"), GoogleVeoVideoAdapter)
        self.assertIsInstance(get_video_adapter("kling"), KlingVideoAdapter)
        self.assertIsInstance(get_video_adapter("yunwu-kling"), YunwuKlingVideoAdapter)

    async def test_supports_provider_and_adapter_hint(self):
        adapter = SeedanceOfficialVideoAdapter(FakeLegacySeedanceProvider())

        self.assertTrue(adapter.supports({"provider": "seedance_official"}))
        self.assertTrue(adapter.supports({"provider": "other", "adapterHints": {"adapterId": "seedance:official"}}))
        self.assertFalse(adapter.supports({"provider": "kling"}))

    async def test_build_text_payload_preserves_defaults_and_flags(self):
        adapter = SeedanceOfficialVideoAdapter(self._provider())
        request = VideoCreateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            task_type="multimodal-reference",
            prompt="Use @image_1 then @video_1 and @audio_1",
            params={
                "aspectRatio": "16:9",
                "duration": "6s",
                "resolution": "1080p",
                "generateAudio": True,
                "returnLastFrame": True,
                "seed": 123,
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual(payload["model"], "doubao-seedance-2-0-260128")
        self.assertEqual(payload["content"], [{"type": "text", "text": "Use 图片1 then 视频1 and 音频1"}])
        self.assertEqual(payload["ratio"], "16:9")
        self.assertEqual(payload["duration"], 6)
        self.assertEqual(payload["resolution"], "1080p")
        self.assertIs(payload["generate_audio"], True)
        self.assertIs(payload["return_last_frame"], True)
        self.assertIs(payload["watermark"], False)
        self.assertEqual(payload["seed"], 123)

    async def test_build_frame_payload_preserves_first_and_last_frame_order(self):
        adapter = SeedanceOfficialVideoAdapter(self._provider())
        request = VideoCreateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            task_type="frame",
            prompt="Animate @image_1",
            params={"aspectRatio": "adaptive", "duration": "5s", "resolution": "720p"},
            inputs={
                "image:firstFrame": [
                    VideoInputAsset(kind="image", role="first_frame", url="https://cdn.example.test/first.png")
                ],
                "image:lastFrame": [
                    VideoInputAsset(kind="image", role="last_frame", url="https://cdn.example.test/last.png")
                ],
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual(payload["content"][0], {"type": "text", "text": "Animate 图片1"})
        self.assertEqual(payload["content"][1]["role"], "first_frame")
        self.assertEqual(payload["content"][1]["image_url"]["url"], "https://cdn.example.test/first.png")
        self.assertEqual(payload["content"][2]["role"], "last_frame")
        self.assertEqual(payload["content"][2]["image_url"]["url"], "https://cdn.example.test/last.png")
        self.assertIs(payload["watermark"], False)

    async def test_build_multimodal_payload_preserves_asset_url_order(self):
        adapter = SeedanceOfficialVideoAdapter(self._provider())
        request = VideoCreateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            task_type="multimodal-reference",
            prompt="references",
            inputs={
                "image:references": [
                    VideoInputAsset(kind="image", role="reference", url="https://cdn.example.test/a.png"),
                    VideoInputAsset(kind="image", role="reference", url="https://cdn.example.test/b.png"),
                ],
                "video:references": [
                    VideoInputAsset(kind="video", role="reference", url="https://cdn.example.test/a.mp4"),
                ],
                "audio:references": [
                    VideoInputAsset(kind="audio", role="reference", url="https://cdn.example.test/a.mp3"),
                ],
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual([item["role"] for item in payload["content"][1:]], [
            "reference_image",
            "reference_image",
            "reference_video",
            "reference_audio",
        ])
        self.assertEqual(payload["content"][1]["image_url"]["url"], "https://cdn.example.test/a.png")
        self.assertEqual(payload["content"][2]["image_url"]["url"], "https://cdn.example.test/b.png")
        self.assertEqual(payload["content"][3]["video_url"]["url"], "https://cdn.example.test/a.mp4")
        self.assertEqual(payload["content"][4]["audio_url"]["url"], "https://cdn.example.test/a.mp3")

    async def test_build_payload_uses_public_asset_service_without_real_upload(self):
        public_assets = PassthroughPublicAssets()
        adapter = SeedanceOfficialVideoAdapter(self._provider(public_assets=public_assets))
        request = VideoCreateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            task_type="multimodal-reference",
            prompt="video ref",
            params={"publicAssetStorage": "tos"},
            inputs={
                "video:references": [
                    VideoInputAsset(kind="video", role="reference", path="generation/videos/ref.mp4"),
                ],
            },
        )

        payload = await adapter.build_create_payload(request, self._capability())

        self.assertEqual(payload["content"][1]["video_url"]["url"], "https://public.test/ref.mp4")
        self.assertEqual(public_assets.calls, [{
            "value": "generation/videos/ref.mp4",
            "project_path": None,
            "storage_provider": "tos",
        }])

    async def test_create_and_query_reuse_legacy_provider_without_network(self):
        legacy = FakeLegacySeedanceProvider()
        adapter = SeedanceOfficialVideoAdapter(legacy)

        created = await adapter.create(
            VideoCreateRequest(
                provider="seedance_official",
                model="doubao-seedance-2-0-260128",
                task_type="multimodal-reference",
                prompt="hello",
            ),
            self._capability(),
        )
        queried = await adapter.query(
            VideoQueryRequest(provider="seedance_official", model="doubao-seedance-2-0-260128", task_id=created.task_id),
            self._capability(),
        )

        self.assertEqual(created.task_id, "seedance-task-1")
        self.assertEqual(created.status, "queued")
        self.assertEqual(legacy.created_requests[0].provider, "seedance_official")
        self.assertEqual(queried.status, "succeeded")
        self.assertEqual(queried.video_url, "https://seedance.test/video.mp4")
        self.assertEqual(queried.last_frame_url, "https://seedance.test/last.png")
        self.assertEqual(legacy.query_calls, ["seedance-task-1"])

    async def test_query_statuses_normalize_and_preserve_readable_errors(self):
        class QueryProvider:
            def __init__(self, response):
                self.response = response

            async def query_task(self, task_id):
                return self.response

        running = await SeedanceOfficialVideoAdapter(QueryProvider({"status": "running", "message": "working"})).query(
            VideoQueryRequest(provider="seedance_official", model="doubao-seedance-2-0-260128", task_id="task"),
            self._capability(),
        )
        failed = await SeedanceOfficialVideoAdapter(QueryProvider({"status": "error", "message": "Seedance: failed"})).query(
            VideoQueryRequest(provider="seedance_official", model="doubao-seedance-2-0-260128", task_id="task"),
            self._capability(),
        )

        self.assertEqual(running.status, "running")
        self.assertEqual(failed.status, "failed")
        self.assertEqual(failed.message, "Seedance: failed")

    async def test_provider_errors_are_wrapped_and_classified(self):
        class FailingProvider:
            async def create_task(self, request):
                raise ValueError("Seedance HTTP 401: invalid token")

        adapter = SeedanceOfficialVideoAdapter(FailingProvider())

        with self.assertRaises(VideoProviderError) as context:
            await adapter.create(
                VideoCreateRequest(
                    provider="seedance_official",
                    model="doubao-seedance-2-0-260128",
                    task_type="multimodal-reference",
                    prompt="x",
                ),
                self._capability(),
            )

        self.assertEqual(context.exception.provider, "seedance_official")
        self.assertEqual(context.exception.category, "auth_error")

    async def test_service_routes_seedance_through_adapter(self):
        service = VideoGenerationService(yunwu_api_key="mock")
        fake_legacy = FakeLegacySeedanceProvider()
        service.providers["seedance_official"] = fake_legacy

        request = VideoGenerateRequest(
            projectPath="Z:/tmp/project",
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="multimodal-reference",
            prompt="service route",
        )

        with patch("video_generation.service.upsert_task", new_callable=AsyncMock) as upsert:
            task = await service.create_task("Z:/tmp/project", request)

        self.assertEqual(task.provider, "seedance_official")
        self.assertEqual(task.providerTaskId, "seedance-task-1")
        self.assertEqual(len(fake_legacy.created_requests), 1)
        upsert.assert_awaited_once()

    async def test_adapter_import_and_init_do_not_create_client_or_upload(self):
        with patch("video_generation.adapters.seedance.SeedanceOfficialProvider") as provider:
            SeedanceOfficialVideoAdapter()

        provider.assert_not_called()

    async def test_adapter_hints_do_not_enter_schema_snapshot(self):
        capabilities = [capability for capability in list_video_model_capabilities() if capability["provider"] == "seedance_official"]

        self.assertTrue(capabilities)
        for capability in capabilities:
            self.assertEqual(capability["adapterHints"]["adapterId"], "seedance:official")
            self.assertEqual(capability["adapterHints"]["runtime"], "adapter")
            self.assertNotIn("adapterHints", build_model_schema_snapshot(capability))


if __name__ == "__main__":
    unittest.main()
