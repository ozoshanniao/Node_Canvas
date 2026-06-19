import asyncio
import unittest
from unittest.mock import patch

from media.provider_asset_uploader import ProviderAssetUploadRouter
from media.provider_asset_types import ProviderAssetUploadResult


def run(coro):
    return asyncio.run(coro)


IMAGE_DATA_URI = "data:image/png;base64,aW1hZ2U="
VIDEO_DATA_URI = "data:video/mp4;base64,dmlkZW8="
AUDIO_DATA_URI = "data:audio/mpeg;base64,YXVkaW8="


class FakePublicAssets:
    def __init__(self):
        self.calls = []

    async def ensure_public_url(self, value, project_path=None, storage_provider=None):
        self.calls.append((value, project_path, storage_provider))
        return "https://r2.test/uploaded"


class ProviderAssetUploadRouterTest(unittest.TestCase):
    def test_kie_small_data_uri_uses_base64_upload_mock(self):
        calls = []

        async def fake_kie_uploader(**kwargs):
            calls.append(kwargs)
            return ProviderAssetUploadResult(provider="kie", source_kind="base64", url="https://kie.test/file.png", storage="kie")

        router = ProviderAssetUploadRouter(kie_uploader=fake_kie_uploader)
        with patch.dict("os.environ", {"KIE_API_KEY": "fake-kie-key"}, clear=False):
            result = run(router.resolve(provider="kie", asset=IMAGE_DATA_URI, purpose="input"))

        self.assertEqual(result.url, "https://kie.test/file.png")
        self.assertEqual(result.storage, "kie")
        self.assertEqual(result.source_kind, "base64")
        self.assertEqual(calls[0]["api_key"], "fake-kie-key")
        self.assertEqual(calls[0]["base64_data"], IMAGE_DATA_URI)
        self.assertEqual(calls[0]["mime_type"], "image/png")

    def test_fal_data_uri_uses_fal_uploader_mock(self):
        calls = []

        async def fake_fal_uploader(**kwargs):
            calls.append(kwargs)
            return {"url": "https://fal.test/file.png", "raw": {"id": "fal-file"}}

        router = ProviderAssetUploadRouter(fal_uploader=fake_fal_uploader)
        with patch.dict("os.environ", {"FAL_API_KEY": "fake-fal-key"}, clear=False):
            result = run(router.resolve(provider="fal", asset=IMAGE_DATA_URI, purpose="input"))

        self.assertEqual(result.url, "https://fal.test/file.png")
        self.assertEqual(result.storage, "fal_cdn")
        self.assertEqual(result.source_kind, "provider_cdn")
        self.assertEqual(calls[0]["api_key"], "fake-fal-key")
        self.assertEqual(calls[0]["mime_type"], "image/png")

    def test_existing_https_url_passthrough_for_provider_cdns(self):
        router = ProviderAssetUploadRouter()

        kie = run(router.resolve(provider="kie", asset="https://cdn.example.test/a.png", purpose="input"))
        fal = run(router.resolve(provider="fal", asset="https://cdn.example.test/a.png", purpose="input"))

        self.assertEqual(kie.url, "https://cdn.example.test/a.png")
        self.assertEqual(fal.url, "https://cdn.example.test/a.png")
        self.assertEqual(kie.source_kind, "url")
        self.assertEqual(fal.source_kind, "url")

    def test_kie_https_url_preferred_provider_cdn_uses_url_upload_mock(self):
        calls = []

        async def fake_kie_uploader(**kwargs):
            calls.append(kwargs)
            return ProviderAssetUploadResult(provider="kie", source_kind="url", url="https://kie.test/copied.png", storage="kie")

        router = ProviderAssetUploadRouter(kie_uploader=fake_kie_uploader)

        with patch.dict("os.environ", {"KIE_API_KEY": "fake-kie-key"}, clear=False):
            result = run(router.resolve(
                provider="kie",
                asset="https://cdn.example.test/a.png",
                purpose="input",
                preferred_upload="provider_cdn",
            ))

        self.assertEqual(result.url, "https://kie.test/copied.png")
        self.assertEqual(calls[0]["file_url"], "https://cdn.example.test/a.png")
        self.assertEqual(calls[0]["preferred_upload"], "provider_cdn")

    def test_kie_large_data_uri_uses_stream_upload_mock(self):
        class LargeData:
            def __len__(self):
                return 11 * 1024 * 1024

        calls = []

        async def fake_kie_uploader(**kwargs):
            calls.append(kwargs)
            return ProviderAssetUploadResult(provider="kie", source_kind="stream", url="https://kie.test/large.png", storage="kie")

        router = ProviderAssetUploadRouter(kie_uploader=fake_kie_uploader)

        async def fake_prepare(asset, project_path):
            class Media:
                raw_data = LargeData()
                mime_type = "image/png"
                filename = "large.png"
            return Media()

        router._prepare = fake_prepare
        with patch.dict("os.environ", {"KIE_API_KEY": "fake-kie-key"}, clear=False):
            result = run(router.resolve(provider="kie", asset=IMAGE_DATA_URI, purpose="input"))

        self.assertEqual(result.source_kind, "stream")
        self.assertEqual(calls[0]["preferred_upload"], "stream")
        self.assertEqual(calls[0]["filename"], "large.png")

    def test_kie_local_file_uses_stream_upload_mock(self):
        calls = []

        async def fake_kie_uploader(**kwargs):
            calls.append(kwargs)
            return ProviderAssetUploadResult(provider="kie", source_kind="stream", url="https://kie.test/local.png", storage="kie")

        router = ProviderAssetUploadRouter(kie_uploader=fake_kie_uploader)

        async def fake_prepare(asset, project_path):
            class Media:
                raw_data = b"image"
                mime_type = "image/png"
                filename = "local.png"
            return Media()

        router._prepare = fake_prepare
        with patch.dict("os.environ", {"KIE_API_KEY": "fake-kie-key"}, clear=False):
            result = run(router.resolve(provider="kie", asset="input/local.png", purpose="input", project_path="Z:/project"))

        self.assertEqual(result.source_kind, "stream")
        self.assertEqual(calls[0]["data"], b"image")
        self.assertEqual(calls[0]["filename"], "local.png")

    def test_kie_bytes_use_stream_upload_mock(self):
        calls = []

        async def fake_kie_uploader(**kwargs):
            calls.append(kwargs)
            return ProviderAssetUploadResult(provider="kie", source_kind="stream", url="https://kie.test/bytes.bin", storage="kie")

        router = ProviderAssetUploadRouter(kie_uploader=fake_kie_uploader)
        with patch.dict("os.environ", {"KIE_API_KEY": "fake-kie-key"}, clear=False):
            result = run(router.resolve(provider="kie", asset=b"raw-bytes", purpose="input"))

        self.assertEqual(result.source_kind, "stream")
        self.assertEqual(calls[0]["data"], b"raw-bytes")
        self.assertEqual(calls[0]["preferred_upload"], "stream")

    def test_wavespeed_image_data_uri_uses_wavespeed_uploader_by_default(self):
        public_assets = FakePublicAssets()
        calls = []

        async def fake_wavespeed_uploader(**kwargs):
            calls.append(kwargs)
            return {"url": "https://wavespeed.test/image.png", "storage": "wavespeed", "raw": {"code": 200}}

        router = ProviderAssetUploadRouter(public_asset_service=public_assets, wavespeed_uploader=fake_wavespeed_uploader)
        with patch.dict("os.environ", {"WAVESPEED_API_KEY": "fake-wavespeed-key"}, clear=False):
            result = run(router.resolve(provider="wavespeed", asset=IMAGE_DATA_URI, purpose="image"))

        self.assertEqual(result.source_kind, "provider_media")
        self.assertEqual(result.url, "https://wavespeed.test/image.png")
        self.assertEqual(result.storage, "wavespeed")
        self.assertEqual(calls[0]["api_key"], "fake-wavespeed-key")
        self.assertEqual(public_assets.calls, [])

    def test_wavespeed_video_and_audio_data_uri_use_wavespeed_uploader_by_default(self):
        public_assets = FakePublicAssets()
        calls = []

        async def fake_wavespeed_uploader(**kwargs):
            calls.append(kwargs)
            return {"url": f"https://wavespeed.test/{kwargs['filename']}", "storage": "wavespeed", "raw": {"code": 200}}

        router = ProviderAssetUploadRouter(public_asset_service=public_assets, wavespeed_uploader=fake_wavespeed_uploader)
        with patch.dict("os.environ", {"WAVESPEED_API_KEY": "fake-wavespeed-key"}, clear=False):
            video = run(router.resolve(provider="wavespeed", asset=VIDEO_DATA_URI, purpose="video", storage_provider="r2"))
            audio = run(router.resolve(provider="wavespeed", asset=AUDIO_DATA_URI, purpose="audio", storage_provider="r2"))

        self.assertEqual(video.source_kind, "provider_media")
        self.assertEqual(audio.source_kind, "provider_media")
        self.assertEqual(video.storage, "wavespeed")
        self.assertEqual(audio.storage, "wavespeed")
        self.assertEqual(len(calls), 2)
        self.assertEqual(public_assets.calls, [])

    def test_wavespeed_preferred_r2_uses_public_asset_fallback(self):
        public_assets = FakePublicAssets()

        async def fake_wavespeed_uploader(**kwargs):
            raise AssertionError("WaveSpeed uploader should not be called for preferred r2")

        router = ProviderAssetUploadRouter(public_asset_service=public_assets, wavespeed_uploader=fake_wavespeed_uploader)

        result = run(router.resolve(
            provider="wavespeed",
            asset=VIDEO_DATA_URI,
            purpose="video",
            preferred_upload="r2",
            storage_provider="r2",
        ))

        self.assertEqual(result.url, "https://r2.test/uploaded")
        self.assertEqual(result.source_kind, "public_asset")
        self.assertEqual(len(public_assets.calls), 1)

    def test_wavespeed_preferred_base64_image_keeps_inline_data(self):
        public_assets = FakePublicAssets()

        async def fake_wavespeed_uploader(**kwargs):
            raise AssertionError("WaveSpeed uploader should not be called for preferred base64")

        router = ProviderAssetUploadRouter(public_asset_service=public_assets, wavespeed_uploader=fake_wavespeed_uploader)

        result = run(router.resolve(
            provider="wavespeed",
            asset=IMAGE_DATA_URI,
            purpose="image",
            preferred_upload="base64",
        ))

        self.assertEqual(result.source_kind, "data_uri")
        self.assertEqual(result.data_uri, IMAGE_DATA_URI)
        self.assertEqual(public_assets.calls, [])

    def test_wavespeed_large_input_uses_public_asset_fallback(self):
        class LargeData:
            def __len__(self):
                return 301 * 1024 * 1024

        public_assets = FakePublicAssets()

        async def fake_wavespeed_uploader(**kwargs):
            raise AssertionError("WaveSpeed uploader should not be called for large input")

        router = ProviderAssetUploadRouter(public_asset_service=public_assets, wavespeed_uploader=fake_wavespeed_uploader)

        async def fake_prepare(asset, project_path):
            class Media:
                raw_data = LargeData()
                mime_type = "video/mp4"
                filename = "large.mp4"
            return Media()

        router._prepare = fake_prepare
        result = run(router.resolve(provider="wavespeed", asset=VIDEO_DATA_URI, purpose="video", storage_provider="r2"))

        self.assertEqual(result.source_kind, "public_asset")
        self.assertEqual(result.url, "https://r2.test/uploaded")

    def test_wavespeed_https_url_passthrough(self):
        router = ProviderAssetUploadRouter()

        result = run(router.resolve(provider="wavespeed", asset="https://cdn.example.test/video.mp4", purpose="video"))

        self.assertEqual(result.url, "https://cdn.example.test/video.mp4")
        self.assertEqual(result.source_kind, "url")

    def test_unknown_provider_does_not_trigger_external_upload(self):
        public_assets = FakePublicAssets()
        router = ProviderAssetUploadRouter(public_asset_service=public_assets)

        result = run(router.resolve(provider="unknown", asset="https://cdn.example.test/a.png", purpose="input"))

        self.assertEqual(result.url, "https://cdn.example.test/a.png")
        self.assertEqual(public_assets.calls, [])

    def test_absolute_path_outside_project_is_rejected(self):
        router = ProviderAssetUploadRouter()

        with self.assertRaisesRegex(ValueError, "outside the project workspace|require project_path"):
            run(router.resolve(provider="wavespeed", asset="C:/outside/file.mp4", purpose="video", project_path="Z:/project"))


if __name__ == "__main__":
    unittest.main()
