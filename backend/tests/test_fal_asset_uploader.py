import asyncio
import unittest
from unittest.mock import patch

from media.fal_asset_uploader import upload_to_fal_cdn


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


class FakeFalAsyncClient:
    calls = []

    def __init__(self, timeout=None):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, headers=None, json=None):
        self.calls.append({"method": "POST", "url": url, "headers": headers, "json": json})
        return FakeResponse(200, {
            "upload_url": "https://upload.fal.test/put",
            "file_url": "https://cdn.fal.test/file.png",
        })

    async def put(self, url, content=None, headers=None):
        self.calls.append({"method": "PUT", "url": url, "headers": headers, "content": content})
        return FakeResponse(200, {})


class MissingFieldsFalAsyncClient(FakeFalAsyncClient):
    async def post(self, url, headers=None, json=None):
        return FakeResponse(200, {"upload_url": "https://upload.fal.test/put"})


class ErrorFalAsyncClient(FakeFalAsyncClient):
    async def post(self, url, headers=None, json=None):
        return FakeResponse(429, {"message": "rate limited"})


class FalAssetUploaderTest(unittest.TestCase):
    def setUp(self):
        FakeFalAsyncClient.calls = []

    def test_upload_initiates_puts_binary_and_returns_file_url(self):
        with patch("media.fal_asset_uploader.httpx.AsyncClient", FakeFalAsyncClient):
            result = run(upload_to_fal_cdn(
                data=b"image",
                filename="input.png",
                mime_type="image/png",
                api_key="fake-key",
            ))

        self.assertEqual(result["url"], "https://cdn.fal.test/file.png")
        post_call = FakeFalAsyncClient.calls[0]
        put_call = FakeFalAsyncClient.calls[1]
        self.assertEqual(post_call["headers"]["Authorization"], "Key fake-key")
        self.assertEqual(post_call["json"], {"filename": "input.png", "content_type": "image/png"})
        self.assertEqual(put_call["method"], "PUT")
        self.assertEqual(put_call["headers"]["Content-Type"], "image/png")
        self.assertEqual(put_call["content"], b"image")

    def test_missing_initiate_fields_raises_readable_error(self):
        with patch("media.fal_asset_uploader.httpx.AsyncClient", MissingFieldsFalAsyncClient):
            with self.assertRaisesRegex(ValueError, "upload_url and file_url"):
                run(upload_to_fal_cdn(
                    data=b"image",
                    filename="input.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))

    def test_http_error_raises_readable_error(self):
        with patch("media.fal_asset_uploader.httpx.AsyncClient", ErrorFalAsyncClient):
            with self.assertRaisesRegex(ValueError, "HTTP 429"):
                run(upload_to_fal_cdn(
                    data=b"image",
                    filename="input.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))


if __name__ == "__main__":
    unittest.main()
