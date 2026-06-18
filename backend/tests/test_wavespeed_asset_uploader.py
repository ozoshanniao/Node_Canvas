import asyncio
import unittest
from unittest.mock import patch

from media.wavespeed_asset_uploader import upload_to_wavespeed_media


def run(coro):
    return asyncio.run(coro)


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)
        self.is_error = status_code >= 400

    def json(self):
        return self._payload


class FakeWaveSpeedAsyncClient:
    calls = []
    response = FakeResponse(200, {
        "code": 200,
        "message": "success",
        "data": {
            "type": "image",
            "download_url": "https://wavespeed.test/media/image.png",
            "filename": "image.png",
            "size": 1024,
        },
    })

    def __init__(self, timeout=None):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, headers=None, files=None):
        self.calls.append({"url": url, "headers": headers, "files": files})
        return self.response


class WaveSpeedAssetUploaderTest(unittest.TestCase):
    def setUp(self):
        FakeWaveSpeedAsyncClient.calls = []
        FakeWaveSpeedAsyncClient.response = FakeResponse(200, {
            "code": 200,
            "message": "success",
            "data": {
                "type": "image",
                "download_url": "https://wavespeed.test/media/image.png",
                "filename": "image.png",
                "size": 1024,
            },
        })

    def test_upload_builds_bearer_auth_file_field_and_returns_download_url(self):
        with patch("media.wavespeed_asset_uploader.httpx.AsyncClient", FakeWaveSpeedAsyncClient):
            result = run(upload_to_wavespeed_media(
                data=b"image",
                filename="image.png",
                mime_type="image/png",
                api_key="fake-key",
            ))

        self.assertEqual(result["url"], "https://wavespeed.test/media/image.png")
        self.assertEqual(result["storage"], "wavespeed")
        call = FakeWaveSpeedAsyncClient.calls[0]
        self.assertEqual(call["headers"]["Authorization"], "Bearer fake-key")
        self.assertEqual(call["files"]["file"], ("image.png", b"image", "image/png"))
        self.assertEqual(result["raw"]["data"]["download_url"], "https://wavespeed.test/media/image.png")

    def test_missing_download_url_raises_readable_error(self):
        FakeWaveSpeedAsyncClient.response = FakeResponse(200, {"code": 200, "message": "success", "data": {}})
        with patch("media.wavespeed_asset_uploader.httpx.AsyncClient", FakeWaveSpeedAsyncClient):
            with self.assertRaisesRegex(ValueError, "data.download_url"):
                run(upload_to_wavespeed_media(
                    data=b"image",
                    filename="image.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))

    def test_http_400_raises_invalid_file_error(self):
        FakeWaveSpeedAsyncClient.response = FakeResponse(400, {"message": "bad file"})
        with patch("media.wavespeed_asset_uploader.httpx.AsyncClient", FakeWaveSpeedAsyncClient):
            with self.assertRaisesRegex(ValueError, "invalid or unsupported file"):
                run(upload_to_wavespeed_media(
                    data=b"image",
                    filename="image.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))

    def test_http_401_raises_auth_error(self):
        FakeWaveSpeedAsyncClient.response = FakeResponse(401, {"message": "unauthorized"})
        with patch("media.wavespeed_asset_uploader.httpx.AsyncClient", FakeWaveSpeedAsyncClient):
            with self.assertRaisesRegex(ValueError, "authentication error"):
                run(upload_to_wavespeed_media(
                    data=b"image",
                    filename="image.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))

    def test_http_413_raises_file_too_large_error(self):
        FakeWaveSpeedAsyncClient.response = FakeResponse(413, {"message": "too large"})
        with patch("media.wavespeed_asset_uploader.httpx.AsyncClient", FakeWaveSpeedAsyncClient):
            with self.assertRaisesRegex(ValueError, "file is too large"):
                run(upload_to_wavespeed_media(
                    data=b"image",
                    filename="image.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))

    def test_http_429_raises_rate_limited_error(self):
        FakeWaveSpeedAsyncClient.response = FakeResponse(429, {"message": "rate limited"})
        with patch("media.wavespeed_asset_uploader.httpx.AsyncClient", FakeWaveSpeedAsyncClient):
            with self.assertRaisesRegex(ValueError, "rate limited"):
                run(upload_to_wavespeed_media(
                    data=b"image",
                    filename="image.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))


if __name__ == "__main__":
    unittest.main()
