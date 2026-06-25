import asyncio
import os
import unittest
from unittest.mock import patch

from media.kie_asset_uploader import (
    upload_base64_to_kie,
    upload_stream_to_kie,
    upload_to_kie_cdn,
    upload_url_to_kie,
)


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
    response = FakeResponse(200, {
        "success": True,
        "code": 200,
        "data": {"downloadUrl": "https://kie.test/cdn/file.png", "fileName": "file.png", "fileSize": 5},
    })

    def __init__(self, timeout=None):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, headers=None, json=None, data=None, files=None):
        self.calls.append({
            "url": url,
            "headers": headers,
            "json": json,
            "data": data,
            "files": files,
        })
        return self.response


class KieAssetUploaderTest(unittest.TestCase):
    def setUp(self):
        FakeKieAsyncClient.calls = []
        FakeKieAsyncClient.response = FakeResponse(200, {
            "success": True,
            "code": 200,
            "data": {"downloadUrl": "https://kie.test/cdn/file.png", "fileName": "file.png", "fileSize": 5},
        })
        self.env_patch = patch.dict(os.environ, {"KIE_FILE_UPLOAD_BASE_URL": ""}, clear=False)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_base64_upload_uses_official_json_endpoint(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            result = run(upload_base64_to_kie(
                base64_data="data:image/png;base64,aW1hZ2U=",
                upload_path="images/base64",
                filename="test-image.png",
                api_key="fake-key",
            ))

        call = FakeKieAsyncClient.calls[0]
        self.assertEqual(call["url"], "https://api.kie.ai/api/file-base64-upload")
        self.assertEqual(call["headers"]["Authorization"], "Bearer fake-key")
        self.assertEqual(call["headers"]["Content-Type"], "application/json")
        self.assertEqual(call["json"]["uploadPath"], "images/base64")
        self.assertEqual(call["json"]["fileName"], "test-image.png")
        self.assertEqual(call["json"]["base64Data"], "data:image/png;base64,aW1hZ2U=")
        self.assertEqual(result.url, "https://kie.test/cdn/file.png")
        self.assertEqual(result.storage, "kie")

    def test_url_upload_uses_official_json_endpoint_and_custom_base_url(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            result = run(upload_url_to_kie(
                file_url="https://example.test/input.png",
                upload_path="images/downloaded",
                filename="input.png",
                api_key="fake-key",
                base_url="https://kieai.redpandaai.co",
            ))

        call = FakeKieAsyncClient.calls[0]
        self.assertEqual(call["url"], "https://kieai.redpandaai.co/api/file-url-upload")
        self.assertEqual(call["headers"]["Authorization"], "Bearer fake-key")
        self.assertEqual(call["headers"]["Content-Type"], "application/json")
        self.assertEqual(call["json"], {
            "fileUrl": "https://example.test/input.png",
            "uploadPath": "images/downloaded",
            "fileName": "input.png",
        })
        self.assertEqual(result.url, "https://kie.test/cdn/file.png")

    def test_stream_upload_uses_official_multipart_endpoint(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            result = run(upload_stream_to_kie(
                data=b"image",
                filename="input.png",
                mime_type="image/png",
                upload_path="images/user-uploads",
                api_key="fake-key",
            ))

        call = FakeKieAsyncClient.calls[0]
        self.assertEqual(call["url"], "https://api.kie.ai/api/file-stream-upload")
        self.assertNotIn("/api/" + "file-upload", call["url"])
        self.assertEqual(call["headers"]["Authorization"], "Bearer fake-key")
        self.assertEqual(call["data"], {"uploadPath": "images/user-uploads", "fileName": "input.png"})
        self.assertEqual(call["files"]["file"], ("input.png", b"image", "image/png"))
        self.assertEqual(result.url, "https://kie.test/cdn/file.png")

    def test_wrapper_routes_base64_url_and_stream(self):
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            run(upload_to_kie_cdn(base64_data="data:image/png;base64,aW1hZ2U=", filename="a.png", api_key="fake-key"))
            run(upload_to_kie_cdn(file_url="https://example.test/a.png", filename="a.png", api_key="fake-key"))
            run(upload_to_kie_cdn(data=b"image", filename="a.png", mime_type="image/png", api_key="fake-key"))

        self.assertTrue(FakeKieAsyncClient.calls[0]["url"].endswith("/api/file-base64-upload"))
        self.assertTrue(FakeKieAsyncClient.calls[1]["url"].endswith("/api/file-url-upload"))
        self.assertTrue(FakeKieAsyncClient.calls[2]["url"].endswith("/api/file-stream-upload"))

    def test_http_401_raises_auth_error(self):
        FakeKieAsyncClient.response = FakeResponse(401, {"msg": "unauthorized"})
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "authentication failed"):
                run(upload_stream_to_kie(data=b"x", filename="x.png", mime_type="image/png", upload_path="images/node-canvas", api_key="fake-key"))

    def test_http_400_raises_invalid_request(self):
        FakeKieAsyncClient.response = FakeResponse(400, {"msg": "bad request"})
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "request invalid"):
                run(upload_stream_to_kie(data=b"x", filename="x.png", mime_type="image/png", upload_path="images/node-canvas", api_key="fake-key"))

    def test_body_success_false_raises_body_message(self):
        FakeKieAsyncClient.response = FakeResponse(200, {"success": False, "msg": "provider rejected"})
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "provider rejected"):
                run(upload_stream_to_kie(data=b"x", filename="x.png", mime_type="image/png", upload_path="images/node-canvas", api_key="fake-key"))

    def test_body_code_not_200_raises_body_message(self):
        FakeKieAsyncClient.response = FakeResponse(200, {"code": 500, "msg": "business error"})
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "business error"):
                run(upload_stream_to_kie(data=b"x", filename="x.png", mime_type="image/png", upload_path="images/node-canvas", api_key="fake-key"))

    def test_missing_download_url_raises_readable_error(self):
        FakeKieAsyncClient.response = FakeResponse(200, {"success": True, "code": 200, "data": {}})
        with patch("media.kie_asset_uploader.httpx.AsyncClient", FakeKieAsyncClient):
            with self.assertRaisesRegex(ValueError, "data.downloadUrl"):
                run(upload_stream_to_kie(data=b"x", filename="x.png", mime_type="image/png", upload_path="images/node-canvas", api_key="fake-key"))


if __name__ == "__main__":
    unittest.main()
