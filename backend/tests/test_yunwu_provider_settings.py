import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from engines.yunwu_engine import YunwuEngine
from settings_store import SettingsStore
from video_generation.providers.yunwu_veo_provider import YunwuVeoProvider
from video_generation.schemas import VideoGenerateRequest


def run(coro):
    return asyncio.run(coro)


class FakeResponse:
    status_code = 200
    is_error = False
    text = "{}"

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload

    def raise_for_status(self):
        return None


class FakeAsyncClient:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, url, headers=None, json=None):
        self.calls.append(("post", url, headers, json))
        return FakeResponse({"id": "task-1"})

    async def get(self, url, headers=None, params=None):
        self.calls.append(("get", url, headers, params))
        return FakeResponse({"status": "pending"})


class FakeNanoHandler:
    api_keys = []

    def __init__(self, api_key, base_url):
        self.api_keys.append(api_key)

    async def handle(self, *args, **kwargs):
        return "generation/image.png"


class YunwuProviderSettingsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SettingsStore(Path(self.temp_dir.name) / "settings.json")
        self.store.set_provider("yunwu", {"apiKey": "settings-yunwu"})
        self.store_patch = patch("settings_resolver.SettingsStore", return_value=self.store)
        self.store_patch.start()

    def tearDown(self):
        self.store_patch.stop()
        self.temp_dir.cleanup()

    def test_yunwu_image_uses_settings_key(self):
        FakeNanoHandler.api_keys = []
        with (
            patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False),
            patch("engines.yunwu_handlers.nano_handler.NanoHandler", FakeNanoHandler),
        ):
            result = run(
                YunwuEngine().generate(
                    {"model": "Nano 2"},
                    "prompt",
                    "generation",
                )
            )

        self.assertEqual(result, "generation/image.png")
        self.assertEqual(FakeNanoHandler.api_keys, ["settings-yunwu"])

    def test_yunwu_image_missing_credentials_is_clear(self):
        self.store.clear_provider("yunwu")
        with patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False):
            with self.assertRaisesRegex(ValueError, "Settings -> Providers"):
                run(YunwuEngine().generate({"model": "Nano 2"}, "prompt", "generation"))

    def test_yunwu_video_create_and_query_use_settings_key(self):
        FakeAsyncClient.calls = []
        request = VideoGenerateRequest(
            provider="yunwu",
            model="veo3.1",
            videoMode="text-to-video",
            prompt="prompt",
        )
        with (
            patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False),
            patch("video_generation.providers.yunwu_veo_provider.httpx.AsyncClient", FakeAsyncClient),
        ):
            provider = YunwuVeoProvider()
            run(provider.create_task(request))
            run(provider.query_task("task-1"))

        self.assertEqual(len(FakeAsyncClient.calls), 2)
        self.assertTrue(
            all(call[2]["Authorization"] == "Bearer settings-yunwu" for call in FakeAsyncClient.calls)
        )

    def test_yunwu_video_missing_credentials_is_clear(self):
        self.store.clear_provider("yunwu")
        with patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False):
            with self.assertRaisesRegex(ValueError, "Settings -> Providers"):
                YunwuVeoProvider()._headers()


if __name__ == "__main__":
    unittest.main()
