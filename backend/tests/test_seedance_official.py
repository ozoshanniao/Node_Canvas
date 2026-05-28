import asyncio
import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from media.public_asset_service import PublicAssetService
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
    async def ensure_public_url(self, value, project_path=None):
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
                    "firstFrame": "input/first.png",
                    "lastFrame": "input/last.png",
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
                    "images": ["input/a.png"],
                    "videos": ["generation/videos/a.mp4"],
                    "audios": ["input/a.mp3"],
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
        self.assertEqual(updated.outputs["videoUrl"], "/api/video/video_local_task.mp4")
        self.assertEqual(updated.outputs["lastFrame"], last_frame)
        self.assertEqual(updated.outputs["lastFrame"]["url"], "generation/official_task_42_last_frame.png")
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
        self.assertEqual(updated.outputs["videoUrl"], "/api/video/video_local_task.mp4")
        self.assertIsNone(updated.outputs.get("lastFrame"))
        self.assertIn("last frame download failed", updated.outputs.get("lastFrameWarning", "").lower())


if __name__ == "__main__":
    unittest.main()
