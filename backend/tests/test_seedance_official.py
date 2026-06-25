import asyncio
import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from media.public_asset_service import PublicAssetService
from video_generation.providers.seedance_official import assets as seedance_assets
from video_generation.providers.seedance_official.provider import SeedanceOfficialProvider
from video_generation.providers.seedance_official.payloads import (
    SeedancePayloadBuilder,
    normalize_provider_prompt_references,
)
from video_generation.schemas import VideoGenerateRequest, VideoTask
from video_generation.service import VideoGenerationService
from video_generation.specs import get_video_model_specs


def run(coro):
    return asyncio.run(coro)


class PassthroughPublicAssets:
    async def ensure_public_url(self, value, project_path=None, storage_provider=None):
        return f"https://public.test/{Path(str(value)).name}"


class FakeR2Backend:
    def __init__(self):
        self.uploads = []

    async def upload(self, storage_key, raw_data, mime_type):
        self.uploads.append({
            "storage_key": storage_key,
            "raw_data": raw_data,
            "mime_type": mime_type,
        })
        return f"https://r2.test/{storage_key}"


class RecordingPublicAssets:
    def __init__(self):
        self.calls = []

    async def ensure_public_url(self, value, project_path=None, storage_provider=None):
        self.calls.append({
            "value": value,
            "project_path": project_path,
            "storage_provider": storage_provider,
        })
        return f"https://r2.test/{Path(str(value)).name}"


class FakeLocalPath:
    def __init__(self, suffix, size=None, data=b"x"):
        self.suffix = suffix
        self._data = data
        self._size = len(data) if size is None else size

    def stat(self):
        class Stat:
            pass

        stat = Stat()
        stat.st_size = self._size
        return stat

    def read_bytes(self):
        return self._data


class RecordingSeedanceClient:
    def __init__(self):
        self.payloads = []

    async def create_task(self, payload):
        self.payloads.append(payload)
        return {"id": "seedance-task", "status": "queued"}

    async def query_task(self, task_id):
        return {"status": "running"}


class SeedancePayloadBuilderTest(unittest.TestCase):
    def test_specs_include_seedance_provider(self):
        providers = {provider["id"]: provider for provider in get_video_model_specs()["providers"]}
        self.assertIn("seedance_official", providers)
        self.assertEqual(providers["seedance_official"]["label"], "Seedance")
        self.assertEqual(
            {model["id"] for model in providers["seedance_official"]["models"]},
            {"doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128"},
        )

    def test_frame_payload_maps_frames_and_watermark_false(self):
        builder = SeedancePayloadBuilder(PassthroughPublicAssets())
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="frame",
            prompt="Animate @image_1",
            aspectRatio="adaptive",
            duration="6s",
            resolution="1080p",
            generateAudio=True,
            returnLastFrame=True,
            customParams={
                "seedance": {
                    "mode": "frame",
                    "firstFrame": "https://public.test/first.png",
                    "lastFrame": "https://public.test/last.png",
                    "images": [],
                    "videos": [],
                    "audios": [],
                }
            },
        )

        payload = run(builder.build_payload(request, "/project"))

        self.assertEqual(payload["content"][0], {"type": "text", "text": "Animate 图片1"})
        self.assertEqual(payload["content"][1]["role"], "first_frame")
        self.assertEqual(payload["content"][1]["image_url"]["url"], "https://public.test/first.png")
        self.assertEqual(payload["content"][2]["role"], "last_frame")
        self.assertEqual(payload["content"][2]["image_url"]["url"], "https://public.test/last.png")
        self.assertIs(payload["watermark"], False)
        self.assertIs(payload["generate_audio"], True)
        self.assertIs(payload["return_last_frame"], True)

    def test_multimodal_payload_maps_media_roles(self):
        builder = SeedancePayloadBuilder(PassthroughPublicAssets())
        request = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="multimodal-reference",
            prompt="Use @image1 then @video_1 and @audio_1",
            customParams={
                "seedance": {
                    "mode": "multimodal-reference",
                    "images": ["https://public.test/a.png"],
                    "videos": ["https://public.test/a.mp4"],
                    "audios": ["https://public.test/a.mp3"],
                }
            },
        )

        payload = run(builder.build_payload(request, "/project"))

        self.assertEqual(payload["content"][0]["text"], "Use 图片1 then 视频1 and 音频1")
        self.assertEqual([item["role"] for item in payload["content"][1:]], [
            "reference_image",
            "reference_video",
            "reference_audio",
        ])

    def test_seed_is_omitted_until_non_negative(self):
        builder = SeedancePayloadBuilder(PassthroughPublicAssets())

        def build(seed):
            return run(builder.build_payload(VideoGenerateRequest(
                provider="seedance_official",
                model="doubao-seedance-2-0-260128",
                videoMode="multimodal-reference",
                prompt="Prompt",
                seed=seed,
                customParams={"seedance": {"mode": "multimodal-reference"}},
            ), "/project"))

        self.assertNotIn("seed", build(None))
        self.assertNotIn("seed", build(-1))
        self.assertEqual(build(0)["seed"], 0)
        self.assertEqual(build(12345)["seed"], 12345)

    def test_prompt_reference_normalizer(self):
        self.assertEqual(normalize_provider_prompt_references("@image_1 @image1"), "图片1 图片1")
        self.assertEqual(normalize_provider_prompt_references("@video_1 <<<audio_1>>>"), "视频1 音频1")

    def test_prompt_reference_normalizer_supports_chinese_placeholders(self):
        self.assertEqual(
            normalize_provider_prompt_references("让 @图片1 中的人物看向 @视频2，并参考 @音频3 的节奏"),
            "让 图片1 中的人物看向 视频2，并参考 音频3 的节奏",
        )
        self.assertEqual(
            normalize_provider_prompt_references("Use @image_1 and @video2 with @audio_3"),
            "Use 图片1 and 视频2 with 音频3",
        )

    def test_validation_rules(self):
        builder = SeedancePayloadBuilder(PassthroughPublicAssets())

        def request_with(seedance):
            return VideoGenerateRequest(
                provider="seedance_official",
                model="doubao-seedance-2-0-260128",
                videoMode="multimodal-reference",
                prompt="Prompt",
                customParams={"seedance": seedance},
            )

        with self.assertRaisesRegex(ValueError, "at most 9 images"):
            run(builder.build_payload(request_with({"mode": "multimodal-reference", "images": [str(i) for i in range(10)]}), None))
        with self.assertRaisesRegex(ValueError, "at most 3 videos"):
            run(builder.build_payload(request_with({"mode": "multimodal-reference", "videos": [str(i) for i in range(4)]}), None))
        with self.assertRaisesRegex(ValueError, "at most 3 audios"):
            run(builder.build_payload(request_with({"mode": "multimodal-reference", "audios": [str(i) for i in range(4)]}), None))
        with self.assertRaisesRegex(ValueError, "audio-only"):
            run(builder.build_payload(request_with({"mode": "multimodal-reference", "audios": ["a.mp3"]}), None))

        prompt_only = run(builder.build_payload(request_with({"mode": "multimodal-reference"}), None))
        self.assertEqual(prompt_only["content"], [{"type": "text", "text": "Prompt"}])

        frame_missing = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="frame",
            prompt="Prompt",
            customParams={"seedance": {"mode": "frame"}},
        )
        with self.assertRaisesRegex(ValueError, "firstFrame"):
            run(builder.build_payload(frame_missing, None))

        fast_1080p = VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-fast-260128",
            videoMode="multimodal-reference",
            prompt="Prompt",
            resolution="1080p",
            customParams={"seedance": {"mode": "multimodal-reference"}},
        )
        with self.assertRaisesRegex(ValueError, "1080p"):
            run(builder.build_payload(fast_1080p, None))


class SeedanceAssetResolutionTest(unittest.TestCase):
    def _provider(self):
        public_assets = RecordingPublicAssets()
        client = RecordingSeedanceClient()
        provider = SeedanceOfficialProvider(
            client=client,
            payload_builder=SeedancePayloadBuilder(public_assets),
        )
        return provider, client, public_assets

    def _request(self, project_path, seedance, prompt="Prompt", public_asset_storage=None):
        return VideoGenerateRequest(
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode=seedance.get("mode", "multimodal-reference"),
            prompt=prompt,
            customParams={"seedance": seedance},
            projectPath=project_path,
            publicAssetStorage=public_asset_storage,
        )

    def test_local_small_png_frame_uses_base64_without_r2(self):
        provider, client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", data=b"\x89PNG\r\n\x1a\nsmall")):
            run(provider.create_task(self._request("/project", {"mode": "frame", "firstFrame": "input/first.png"})))

        url = client.payloads[0]["content"][1]["image_url"]["url"]
        self.assertTrue(url.startswith("data:image/png;base64,"))
        self.assertEqual(public_assets.calls, [])

    def test_local_jpeg_and_webp_images_use_base64(self):
        provider, client, _public_assets = self._provider()
        local_files = {
            "input/a.jpg": FakeLocalPath(".jpg", data=b"jpeg"),
            "input/b.webp": FakeLocalPath(".webp", data=b"webp"),
        }

        with patch.object(seedance_assets, "_local_project_file", side_effect=lambda value, _project: local_files[value]):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": ["input/a.jpg", "input/b.webp"],
            })))

        urls = [item["image_url"]["url"] for item in client.payloads[0]["content"][1:]]
        self.assertTrue(urls[0].startswith("data:image/jpeg;base64,"))
        self.assertTrue(urls[1].startswith("data:image/webp;base64,"))

    def test_image_over_single_limit_falls_back_to_r2(self):
        provider, client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", size=(10 * 1024 * 1024) + 1)):
            run(provider.create_task(self._request("/project", {"mode": "frame", "firstFrame": "input/large.png"})))

        url = client.payloads[0]["content"][1]["image_url"]["url"]
        self.assertTrue(url.startswith("https://r2.test/"))
        self.assertEqual(len(public_assets.calls), 1)

    def test_public_asset_storage_tos_is_passed_to_image_fallback(self):
        provider, client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", size=(10 * 1024 * 1024) + 1)):
            run(provider.create_task(self._request(
                "/project",
                {"mode": "frame", "firstFrame": "input/large.png"},
                public_asset_storage="tos",
            )))

        self.assertTrue(client.payloads[0]["content"][1]["image_url"]["url"].startswith("https://r2.test/"))
        self.assertEqual(public_assets.calls[0]["storage_provider"], "tos")

    def test_public_asset_storage_r2_is_passed_to_image_fallback(self):
        provider, _client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", size=(10 * 1024 * 1024) + 1)):
            run(provider.create_task(self._request(
                "/project",
                {"mode": "frame", "firstFrame": "input/large.png"},
                public_asset_storage="r2",
            )))

        self.assertEqual(public_assets.calls[0]["storage_provider"], "r2")

    def test_public_asset_storage_empty_uses_env_default(self):
        provider, _client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", size=(10 * 1024 * 1024) + 1)):
            run(provider.create_task(self._request(
                "/project",
                {"mode": "frame", "firstFrame": "input/large.png"},
                public_asset_storage="",
            )))

        self.assertIsNone(public_assets.calls[0]["storage_provider"])

    def test_image_total_limit_falls_back_after_threshold(self):
        images = [f"input/{index}.png" for index in range(1, 6)]
        local_files = {
            value: FakeLocalPath(".png", size=size_mb * 1024 * 1024, data=b"x")
            for value, size_mb in zip(images, [9, 9, 9, 9, 5])
        }
        provider, client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", side_effect=lambda value, _project: local_files[value]):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": images,
            })))

        urls = [item["image_url"]["url"] for item in client.payloads[0]["content"][1:]]
        self.assertEqual([url.startswith("data:image/png;base64,") for url in urls], [True, True, True, True, False])
        self.assertTrue(urls[-1].startswith("https://r2.test/"))
        self.assertEqual(len(public_assets.calls), 1)

    def test_http_image_url_is_preserved(self):
        provider, client, public_assets = self._provider()

        run(provider.create_task(self._request("/project", {
            "mode": "multimodal-reference",
            "images": ["https://example.test/image.png"],
        })))

        self.assertEqual(client.payloads[0]["content"][1]["image_url"]["url"], "https://example.test/image.png")
        self.assertEqual(public_assets.calls, [])

    def test_image_base64_failure_falls_back_to_r2(self):
        provider, client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", data=b"image")), patch.object(
            seedance_assets, "_data_url", side_effect=RuntimeError("encode failed")
        ):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": ["input/a.png"],
            })))

        self.assertTrue(client.payloads[0]["content"][1]["image_url"]["url"].startswith("https://r2.test/"))
        self.assertEqual(len(public_assets.calls), 1)

    def test_small_image_base64_ignores_public_asset_storage(self):
        provider, client, public_assets = self._provider()

        with patch.object(seedance_assets, "_local_project_file", return_value=FakeLocalPath(".png", data=b"\x89PNG\r\n\x1a\nsmall")):
            run(provider.create_task(self._request(
                "/project",
                {"mode": "frame", "firstFrame": "input/first.png"},
                public_asset_storage="tos",
            )))

        self.assertTrue(client.payloads[0]["content"][1]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertEqual(public_assets.calls, [])

    def test_local_mp3_and_wav_audio_use_base64(self):
        provider, client, _public_assets = self._provider()
        local_files = {
            "input/ref.png": FakeLocalPath(".png", data=b"image"),
            "input/a.mp3": FakeLocalPath(".mp3", data=b"mp3"),
            "input/b.wav": FakeLocalPath(".wav", data=b"wav"),
        }

        with patch.object(seedance_assets, "_local_project_file", side_effect=lambda value, _project: local_files[value]):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": ["input/ref.png"],
                "audios": ["input/a.mp3", "input/b.wav"],
            })))

        urls = [
            item["audio_url"]["url"]
            for item in client.payloads[0]["content"]
            if item.get("role") == "reference_audio"
        ]
        self.assertTrue(urls[0].startswith("data:audio/mpeg;base64,"))
        self.assertTrue(urls[1].startswith("data:audio/wav;base64,"))

    def test_small_audio_base64_ignores_public_asset_storage(self):
        provider, client, public_assets = self._provider()
        local_files = {
            "input/ref.png": FakeLocalPath(".png", data=b"image"),
            "input/a.mp3": FakeLocalPath(".mp3", data=b"mp3"),
        }

        with patch.object(seedance_assets, "_local_project_file", side_effect=lambda value, _project: local_files[value]):
            run(provider.create_task(self._request(
                "/project",
                {
                    "mode": "multimodal-reference",
                    "images": ["input/ref.png"],
                    "audios": ["input/a.mp3"],
                },
                public_asset_storage="tos",
            )))

        audio = [item for item in client.payloads[0]["content"] if item.get("role") == "reference_audio"][0]
        self.assertTrue(audio["audio_url"]["url"].startswith("data:audio/mpeg;base64,"))
        self.assertEqual(public_assets.calls, [])

    def test_http_audio_url_is_preserved_when_wav_or_mp3(self):
        provider, client, public_assets = self._provider()

        run(provider.create_task(self._request("/project", {
            "mode": "multimodal-reference",
            "images": ["https://example.test/image.png"],
            "audios": ["https://example.test/audio.mp3"],
        })))

        audio = [item for item in client.payloads[0]["content"] if item.get("role") == "reference_audio"][0]
        self.assertEqual(audio["audio_url"]["url"], "https://example.test/audio.mp3")
        self.assertEqual(public_assets.calls, [])

    def test_unsupported_audio_format_errors_before_submit(self):
        provider, _client, _public_assets = self._provider()
        local_files = {
            "input/ref.png": FakeLocalPath(".png", data=b"image"),
            "input/a.flac": FakeLocalPath(".flac", data=b"flac"),
        }

        with patch.object(seedance_assets, "_local_project_file", side_effect=lambda value, _project: local_files[value]), self.assertRaisesRegex(ValueError, "wav and mp3"):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": ["input/ref.png"],
                "audios": ["input/a.flac"],
            })))

    def test_audio_over_limit_errors_before_submit(self):
        provider, _client, _public_assets = self._provider()
        local_files = {
            "input/ref.png": FakeLocalPath(".png", data=b"image"),
            "input/a.mp3": FakeLocalPath(".mp3", size=(15 * 1024 * 1024) + 1),
        }

        with patch.object(seedance_assets, "_local_project_file", side_effect=lambda value, _project: local_files[value]), self.assertRaisesRegex(ValueError, "15MB or less"):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": ["input/ref.png"],
                "audios": ["input/a.mp3"],
            })))

    def test_audio_count_and_audio_only_validation_remain(self):
        provider, _client, _public_assets = self._provider()
        with self.assertRaisesRegex(ValueError, "at most 3 audios"):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "images": ["https://example.test/image.png"],
                "audios": ["a.mp3", "b.mp3", "c.mp3", "d.mp3"],
            })))
        with self.assertRaisesRegex(ValueError, "audio-only"):
            run(provider.create_task(self._request("/project", {
                "mode": "multimodal-reference",
                "audios": ["https://example.test/audio.mp3"],
            })))

    def test_video_reference_still_uses_public_asset_url_not_base64(self):
        provider, client, public_assets = self._provider()

        run(provider.create_task(self._request("/project", {
            "mode": "multimodal-reference",
            "videos": ["generation/videos/a.mp4"],
        })))

        video = [item for item in client.payloads[0]["content"] if item.get("role") == "reference_video"][0]
        self.assertTrue(video["video_url"]["url"].startswith("https://r2.test/"))
        self.assertFalse(video["video_url"]["url"].startswith("data:"))
        self.assertEqual(len(public_assets.calls), 1)

    def test_video_reference_passes_public_asset_storage(self):
        provider, client, public_assets = self._provider()

        run(provider.create_task(self._request(
            "/project",
            {
                "mode": "multimodal-reference",
                "videos": ["generation/videos/a.mp4"],
            },
            public_asset_storage="tos",
        )))

        video = [item for item in client.payloads[0]["content"] if item.get("role") == "reference_video"][0]
        self.assertEqual(video["video_url"]["url"], "https://r2.test/a.mp4")
        self.assertEqual(public_assets.calls[0]["storage_provider"], "tos")

    def test_invalid_public_asset_storage_errors_before_submit(self):
        provider, _client, _public_assets = self._provider()

        with self.assertRaisesRegex(ValueError, "Unsupported publicAssetStorage"):
            run(provider.create_task(self._request(
                "/project",
                {
                    "mode": "multimodal-reference",
                    "videos": ["generation/videos/a.mp4"],
                },
                public_asset_storage="s3",
            )))


class PublicAssetServiceTest(unittest.TestCase):
    def test_http_url_passthrough(self):
        service = PublicAssetService(backend=FakeR2Backend(), cache_db_path=":memory:")
        self.assertEqual(
            run(service.ensure_public_url("https://example.test/a.png")),
            "https://example.test/a.png",
        )

    def test_local_file_upload_cache_and_expiry(self):
        media_path = Path(__file__).resolve().parents[2] / "requirements.txt"
        backend = FakeR2Backend()
        with patch.dict(os.environ, {
            "PUBLIC_ASSET_STORAGE": "r2",
            "PUBLIC_ASSET_PREFIX": "node-canvas/seedance-input/",
            "PUBLIC_ASSET_CACHE_TTL_DAYS": "4",
        }):
            service = PublicAssetService(backend=backend, cache_db_path=":memory:")
            first_url = run(service.ensure_public_url(str(media_path)))
            second_url = run(service.ensure_public_url(str(media_path)))

            self.assertEqual(first_url, second_url)
            self.assertEqual(len(backend.uploads), 1)
            self.assertEqual(backend.uploads[0]["mime_type"], "text/plain")

            service._connect().execute("UPDATE public_assets SET expires_at = ?", ("2000-01-01T00:00:00+00:00",))

            expired_url = run(service.ensure_public_url(str(media_path)))
            self.assertEqual(expired_url, first_url)
            self.assertEqual(len(backend.uploads), 2)


class FakeSeedanceClient:
    def __init__(self, query_response):
        self.query_response = query_response

    async def query_task(self, task_id):
        return self.query_response


class FakeSeedanceProvider:
    def __init__(self, response):
        self.response = response

    async def query_task(self, provider_task_id):
        return self.response


class SeedanceLastFrameQueryTest(unittest.TestCase):
    def test_provider_extracts_content_last_frame_url_on_success(self):
        provider = SeedanceOfficialProvider(client=FakeSeedanceClient({
            "status": "succeeded",
            "content": {
                "video_url": "https://seedance.test/video.mp4",
                "last_frame_url": "https://seedance.test/last.png",
            },
        }))

        result = run(provider.query_task("seedance/task:1"))

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["remoteVideoUrl"], "https://seedance.test/video.mp4")
        self.assertEqual(result["lastFrameRemoteUrl"], "https://seedance.test/last.png")

    def _service_with_task(self, provider_response):
        service = VideoGenerationService(yunwu_api_key="mock")
        service.providers["seedance_official"] = FakeSeedanceProvider(provider_response)
        task = VideoTask(
            id="video_local_task",
            provider="seedance_official",
            model="doubao-seedance-2-0-260128",
            videoMode="frame",
            status="running",
            progress=60,
            message="running",
            providerTaskId="official/task:42",
            outputs={},
            request={},
            createdAt=1,
            updatedAt=1,
        )
        stored = {}

        async def get_task(_project_path, _task_id):
            return task

        async def upsert_task(_project_path, updated_task):
            stored["task"] = updated_task
            return updated_task

        return service, stored, get_task, upsert_task

    def test_service_downloads_last_frame_into_generation_output(self):
        response = {
            "status": "success",
            "remoteVideoUrl": "https://seedance.test/video.mp4",
            "lastFrameRemoteUrl": "https://seedance.test/last.png",
        }
        service, stored, get_task, upsert_task = self._service_with_task(response)
        last_frame = {
            "type": "image",
            "sourceType": "generated",
            "url": "generation/official_task_42_last_frame.png",
            "filePath": "generation/official_task_42_last_frame.png",
            "remoteUrl": "https://seedance.test/last.png",
            "filename": "official_task_42_last_frame.png",
            "mimeType": "image/png",
        }

        with patch("video_generation.service.get_task", get_task), patch(
            "video_generation.service.upsert_task", upsert_task
        ), patch(
            "video_generation.service.download_video_to_project", AsyncMock(return_value="/api/video/video_local_task.mp4")
        ), patch(
            "video_generation.service.download_image_to_generation", AsyncMock(return_value=last_frame)
        ) as download_last_frame:
            updated = run(service.query_task("/project", "video_local_task"))

        self.assertEqual(updated.status, "success")
        self.assertEqual(
            updated.outputs["video"]["relativePath"],
            "generation/videos/video_local_task.mp4",
        )
        self.assertEqual(
            updated.outputs["lastFrame"],
            {"relativePath": "generation/official_task_42_last_frame.png"},
        )
        download_last_frame.assert_awaited_once_with(
            "/project",
            "https://seedance.test/last.png",
            "official_task_42_last_frame",
        )
        self.assertIs(stored["task"], updated)

    def test_service_success_without_last_frame_leaves_last_frame_empty(self):
        response = {
            "status": "success",
            "remoteVideoUrl": "https://seedance.test/video.mp4",
        }
        service, _stored, get_task, upsert_task = self._service_with_task(response)

        with patch("video_generation.service.get_task", get_task), patch(
            "video_generation.service.upsert_task", upsert_task
        ), patch(
            "video_generation.service.download_video_to_project", AsyncMock(return_value="/api/video/video_local_task.mp4")
        ), patch("video_generation.service.download_image_to_generation", AsyncMock()) as download_last_frame:
            updated = run(service.query_task("/project", "video_local_task"))

        self.assertEqual(updated.status, "success")
        self.assertEqual(
            updated.outputs["video"]["relativePath"],
            "generation/videos/video_local_task.mp4",
        )
        self.assertIsNone(updated.outputs.get("lastFrame"))
        download_last_frame.assert_not_called()

    def test_service_keeps_video_success_when_last_frame_download_fails(self):
        response = {
            "status": "success",
            "remoteVideoUrl": "https://seedance.test/video.mp4",
            "lastFrameRemoteUrl": "https://seedance.test/last.png",
        }
        service, _stored, get_task, upsert_task = self._service_with_task(response)

        with patch("video_generation.service.get_task", get_task), patch(
            "video_generation.service.upsert_task", upsert_task
        ), patch(
            "video_generation.service.download_video_to_project", AsyncMock(return_value="/api/video/video_local_task.mp4")
        ), patch(
            "video_generation.service.download_image_to_generation", AsyncMock(side_effect=RuntimeError("network down"))
        ):
            updated = run(service.query_task("/project", "video_local_task"))

        self.assertEqual(updated.status, "success")
        self.assertEqual(
            updated.outputs["video"]["relativePath"],
            "generation/videos/video_local_task.mp4",
        )
        self.assertIsNone(updated.outputs.get("lastFrame"))
        self.assertNotIn("lastFrameWarning", updated.outputs)
        self.assertIn("last frame is unavailable", updated.message.lower())


if __name__ == "__main__":
    unittest.main()
