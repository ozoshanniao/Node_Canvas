import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import settings_router
import settings_resolver
from engines.google_engine import GoogleEngine
from image_generation.providers.google_provider import GoogleImageProvider
from llm.providers.google_provider import GoogleLLMProvider
from llm.schemas import LLMGenerateRequest
from media.public_asset_service import R2PublicAssetBackend
from settings_store import SettingsStore
from video_generation.providers.google_veo_provider import GoogleVeoProvider
from video_generation.providers.kling.clients import KlingOfficialClient
from video_generation.providers.seedance_official.client import SeedanceOfficialClient


def run(coro):
    return asyncio.run(coro)


class FakeGoogleModels:
    def generate_content(self, **kwargs):
        return SimpleNamespace(text="ok", candidates=[])


class FakeGoogleClient:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.models = FakeGoogleModels()


class FakeGoogleImageAdapter:
    api_keys = []

    def __init__(self, api_key):
        self.api_key = api_key
        self.api_keys.append(api_key)

    async def generate(self, request, target_model):
        return {"url": f"/api/image/{self.api_key}.png", "model": target_model}


class FakeHttpResponse:
    def raise_for_status(self):
        return None


class FakeHttpClient:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def put(self, url, content, headers):
        self.calls.append({"url": url, "content": content, "headers": headers})
        return FakeHttpResponse()


class ProviderRuntimeSettingsContractTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SettingsStore(Path(self.temp_dir.name) / "settings.json")
        self.store_patch = patch.object(settings_resolver, "SettingsStore", return_value=self.store)
        self.store_patch.start()
        self.env = {
            "GOOGLE_CLOUD_API_KEY": "",
            "GOOGLE_API_KEY": "",
            "GEMINI_API_KEY": "",
            "KLING_ACCESS_KEY": "",
            "KLING_SECRET_KEY": "",
            "ARK_API_KEY": "",
            "CLOUDFLARE_R2_ACCESS_KEY_ID": "",
            "CLOUDFLARE_R2_SECRET_ACCESS_KEY": "",
            "CLOUDFLARE_R2_BUCKET_NAME": "test-bucket",
            "CLOUDFLARE_R2_PUBLIC_DOMAIN": "https://public-r2.test",
            "CLOUDFLARE_R2_ENDPOINT": "https://r2.test",
            "CLOUDFLARE_R2_ACCOUNT_ID": "",
        }
        self.env_patch = patch.dict(os.environ, self.env, clear=False)
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.store_patch.stop()
        self.temp_dir.cleanup()

    def test_google_llm_and_image_refresh_after_settings_update(self):
        self.store.set_provider("google", {"apiKey": "google-settings-1"})
        llm_clients = []

        def fake_llm_client(**kwargs):
            client = FakeGoogleClient(**kwargs)
            llm_clients.append(client)
            return client

        request = LLMGenerateRequest(provider="google", model="gemini-3.1-flash-lite", inputText="Hi")
        with (
            patch("llm.providers.google_provider.genai.Client", side_effect=fake_llm_client),
            patch("llm.providers.google_provider.prepare_llm_image_inputs", new=AsyncMock(return_value=[])),
        ):
            provider = GoogleLLMProvider(api_key=None)
            self.assertEqual(run(provider.generate(request)), "ok")
            self.store.set_provider("google", {"apiKey": "google-settings-2"})
            self.assertEqual(run(provider.generate(request)), "ok")

        self.assertEqual([client.kwargs["api_key"] for client in llm_clients], ["google-settings-1", "google-settings-2"])
        self.assertTrue(all(client.kwargs["vertexai"] is True for client in llm_clients))

        FakeGoogleImageAdapter.api_keys = []
        image_request = SimpleNamespace(model="gemini-3.1-flash-image", config={})
        with patch("image_generation.providers.google_provider.GoogleGeminiImageAdapter", FakeGoogleImageAdapter):
            image_provider = GoogleImageProvider()
            run(image_provider.generate(image_request))
            self.store.set_provider("google", {"apiKey": "google-settings-3"})
            run(image_provider.generate(image_request))

        self.assertEqual(FakeGoogleImageAdapter.api_keys, ["google-settings-2", "google-settings-3"])

    def test_google_video_and_legacy_engine_refresh_without_changing_vertex_options(self):
        self.store.set_provider("google", {"apiKey": "google-video-1"})
        veo_calls = []
        engine_calls = []

        with patch("video_generation.providers.google_veo_provider.genai.Client", side_effect=lambda **kwargs: veo_calls.append(kwargs) or object()):
            provider = GoogleVeoProvider(project="project-1", location="us-central1")
            provider._client()
            self.store.set_provider("google", {"apiKey": "google-video-2"})
            provider._client()

        self.assertEqual([call["api_key"] for call in veo_calls], ["google-video-1", "google-video-2"])
        self.assertTrue(all(call == {
            "vertexai": True,
            "api_key": call["api_key"],
            "project": "project-1",
            "location": "us-central1",
        } for call in veo_calls))

        with patch("engines.google_engine.genai.Client", side_effect=lambda **kwargs: engine_calls.append(kwargs) or object()):
            engine = GoogleEngine()
            engine._client()
            self.store.set_provider("google", {"apiKey": "google-legacy-2"})
            engine._client()

        self.assertEqual([call["api_key"] for call in engine_calls], ["google-video-2", "google-legacy-2"])
        self.assertTrue(all(call["vertexai"] is True for call in engine_calls))

    def test_google_env_has_priority_and_google_studio_is_independent(self):
        self.store.set_provider("google", {"apiKey": "google-settings"})
        self.store.set_provider("google_studio", {"apiKey": "studio-settings"})
        with patch.dict(os.environ, {"GOOGLE_CLOUD_API_KEY": "google-env", "GOOGLE_API_KEY": "", "GEMINI_API_KEY": ""}, clear=False):
            self.assertEqual(settings_resolver.resolve_provider_secret("google", "apiKey", "GOOGLE_CLOUD_API_KEY"), "google-env")
            self.assertEqual(settings_resolver.resolve_google_studio_api_key(), "studio-settings")

    def test_kling_fields_are_independent_dynamic_and_env_first(self):
        self.store.set_provider("kling", {"accessKey": "access-1", "secretKey": "secret-1"})
        credentials = []

        def fake_jwt(access_key, secret_key):
            credentials.append((access_key, secret_key))
            return "fake-token"

        with patch("video_generation.providers.kling.clients.encode_kling_jwt", side_effect=fake_jwt):
            client = KlingOfficialClient()
            client._headers()
            self.store.set_provider("kling", {"accessKey": "access-2", "secretKey": "secret-2"})
            client._headers()
            with patch.dict(os.environ, {"KLING_ACCESS_KEY": "access-env", "KLING_SECRET_KEY": "secret-env"}, clear=False):
                client._headers()

        self.assertEqual(credentials, [
            ("access-1", "secret-1"),
            ("access-2", "secret-2"),
            ("access-env", "secret-env"),
        ])

    def test_seedance_is_dynamic_and_env_first(self):
        self.store.set_provider("seedance", {"apiKey": "seedance-1"})
        client = SeedanceOfficialClient()
        self.assertEqual(client._headers()["Authorization"], "Bearer seedance-1")
        self.store.set_provider("seedance", {"apiKey": "seedance-2"})
        self.assertEqual(client._headers()["Authorization"], "Bearer seedance-2")
        with patch.dict(os.environ, {"ARK_API_KEY": "seedance-env"}, clear=False):
            self.assertEqual(client._headers()["Authorization"], "Bearer seedance-env")

    def test_r2_upload_refreshes_secrets_and_keeps_dependencies_env_only(self):
        self.store.set_provider("cloudflare-r2", {"accessKeyId": "r2-access-1", "secretAccessKey": "r2-secret-1"})
        FakeHttpClient.calls = []
        backend = R2PublicAssetBackend()

        with patch("media.public_asset_service.httpx.AsyncClient", FakeHttpClient):
            run(backend.upload("folder/one.txt", b"one", "text/plain"))
            self.store.set_provider("cloudflare-r2", {"accessKeyId": "r2-access-2", "secretAccessKey": "r2-secret-2"})
            run(backend.upload("folder/two.txt", b"two", "text/plain"))
            with patch.dict(os.environ, {
                "CLOUDFLARE_R2_ACCESS_KEY_ID": "r2-access-env",
                "CLOUDFLARE_R2_SECRET_ACCESS_KEY": "r2-secret-env",
            }, clear=False):
                run(backend.upload("folder/three.txt", b"three", "text/plain"))

        auth_headers = [call["headers"]["Authorization"] for call in FakeHttpClient.calls]
        self.assertIn("Credential=r2-access-1/", auth_headers[0])
        self.assertIn("Credential=r2-access-2/", auth_headers[1])
        self.assertIn("Credential=r2-access-env/", auth_headers[2])
        self.assertEqual(backend.bucket, "test-bucket")
        self.assertEqual(backend.endpoint, "https://r2.test")
        self.assertEqual(backend.public_domain, "https://public-r2.test")

    def test_r2_status_requires_nonsecret_dependencies_and_never_returns_secrets(self):
        secret_values = {
            "accessKeyId": "r2-access-secret-value",
            "secretAccessKey": "r2-secret-secret-value",
        }
        self.store.set_provider("cloudflare-r2", secret_values)
        missing_dependencies_env = {
            **self.env,
            "CLOUDFLARE_R2_BUCKET_NAME": "",
            "CLOUDFLARE_R2_PUBLIC_DOMAIN": "",
            "CLOUDFLARE_R2_ENDPOINT": "",
            "CLOUDFLARE_R2_ACCOUNT_ID": "",
        }
        with patch.dict(os.environ, missing_dependencies_env, clear=False):
            status = next(item for item in settings_router.get_provider_statuses(self.store) if item["id"] == "cloudflare-r2")

        self.assertEqual(status["source"], "settings")
        self.assertFalse(status["configured"])
        self.assertTrue(status["missingDependencyEnv"])
        self.assertEqual(status["publicSettings"], {})
        self.assertNotIn(secret_values["accessKeyId"], str(status))
        self.assertNotIn(secret_values["secretAccessKey"], str(status))


if __name__ == "__main__":
    unittest.main()
