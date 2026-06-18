import asyncio
import unittest
from unittest.mock import patch

from media.kie_asset_uploader import upload_to_kie_cdn


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


class FakeKieAsyncClient:
    calls = []

    def __init__(self, timeout=None):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, headers=None, data=None, files=None):
        self.calls.append({
            "url": url,
            "headers": headers,
            "data": data,
            "files": files,
        })
        return FakeResponse(200, {"data": {"url": "https://kie.test/cdn/file.png"}})


class MissingUrlKieAsyncClient(FakeKieAsyncClient):
    async def post(self, url, headers=None, data=None, files=None):
        return FakeResponse(200, {"data": {}})


class ErrorKieAsyncClient(FakeKieAsyncClient):
    async def post(self, url, headers=None, data=None, files=None):
        return FakeResponse(401, {"message": "unauthorized"})


class KieAssetUploaderTest(unittest.TestCase):
    def setUp(self):
        FakeKieAsyncClient.calls = []

    def test_upload_builds_bearer_auth_and_returns_url(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            result = run(upload_to_kie_cdn(
                data=b"image",
                filename="input.png",
                mime_type="image/png",
                api_key="fake-key",
            ))

        self.assertEqual(result["url"], "https://kie.test/cdn/file.png")
        call = FakeKieAsyncClient.calls[0]
        self.assertEqual(call["headers"]["Authorization"], "Bearer fake-key")
        self.assertEqual(call["files"]["file"], ("input.png", b"image", "image/png"))

    def test_missing_url_raises_readable_error(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", MissingUrlKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "did not include a file URL"):
                run(upload_to_kie_cdn(
                    data=b"image",
                    filename="input.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))

    def test_http_error_raises_readable_error(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", ErrorKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "HTTP 401"):
                run(upload_to_kie_cdn(
                    data=b"image",
                    filename="input.png",
                    mime_type="image/png",
                    api_key="fake-key",
                ))


if __name__ == "__main__":
    unittest.main()
