import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import settings_router
from settings_store import SettingsStore


PROVIDER_ENV_NAMES = {
    "DEEPSEEK_API_KEY",
    "GOOGLE_CLOUD_API_KEY",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_PROJECT_ID",
    "GOOGLE_PROJECT",
    "YUNWU_API_KEY",
    "KLING_ACCESS_KEY",
    "KLING_SECRET_KEY",
    "ARK_API_KEY",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_BUCKET_NAME",
    "CLOUDFLARE_R2_PUBLIC_DOMAIN",
    "CLOUDFLARE_R2_ENDPOINT",
    "CLOUDFLARE_R2_ACCOUNT_ID",
}


def provider_by_id(providers, provider_id):
    return next(provider for provider in providers if provider["id"] == provider_id)


class ProviderSettingsStatusTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SettingsStore(Path(self.temp_dir.name) / "settings.json")
        self.store_patch = patch.object(settings_router, "SETTINGS_STORE", self.store)
        self.store_patch.start()
        app = FastAPI()
        app.include_router(settings_router.router)
        self.client = TestClient(app)
        self.clean_env = {name: "" for name in PROVIDER_ENV_NAMES}

    def tearDown(self):
        self.store_patch.stop()
        self.temp_dir.cleanup()

    def test_get_never_returns_secret_values(self):
        fake_secret = "not-a-real-secret-value"
        self.store.set_provider("deepseek", {"apiKey": fake_secret})

        with patch.dict(os.environ, self.clean_env, clear=False):
            response = self.client.get("/api/settings/providers")

        self.assertEqual(response.status_code, 200)
        deepseek = provider_by_id(response.json()["providers"], "deepseek")
        self.assertEqual(deepseek["source"], "settings")
        self.assertNotIn(fake_secret, response.text)

    def test_env_configured_has_priority(self):
        env = {**self.clean_env, "DEEPSEEK_API_KEY": "fake-env"}
        self.store.set_provider("deepseek", {"apiKey": "fake-settings"})

        with patch.dict(os.environ, env, clear=False):
            deepseek = provider_by_id(settings_router.get_provider_statuses(), "deepseek")

        self.assertTrue(deepseek["configured"])
        self.assertEqual(deepseek["source"], "env")

    def test_missing_env_and_settings_is_none(self):
        with patch.dict(os.environ, self.clean_env, clear=False):
            deepseek = provider_by_id(settings_router.get_provider_statuses(), "deepseek")

        self.assertFalse(deepseek["configured"])
        self.assertEqual(deepseek["source"], "none")
        self.assertEqual(deepseek["missingSettings"], ["apiKey"])

    def test_post_saves_single_key_provider_without_returning_key(self):
        fake_secret = "fake-deepseek"
        with patch.dict(os.environ, self.clean_env, clear=False):
            response = self.client.post("/api/settings/providers/deepseek", json={"apiKey": fake_secret})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"]["source"], "settings")
        self.assertEqual(self.store.get_provider("deepseek"), {"apiKey": fake_secret})
        self.assertNotIn(fake_secret, response.text)

    def test_post_saves_kling_two_key_provider(self):
        payload = {"accessKey": "fake-access", "secretKey": "fake-secret"}
        with patch.dict(os.environ, self.clean_env, clear=False):
            response = self.client.post("/api/settings/providers/kling", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"]["source"], "settings")
        self.assertEqual(self.store.get_provider("kling"), payload)
        self.assertNotIn(payload["accessKey"], response.text)
        self.assertNotIn(payload["secretKey"], response.text)

    def test_delete_clears_settings_provider(self):
        self.store.set_provider("deepseek", {"apiKey": "fake-key"})
        with patch.dict(os.environ, self.clean_env, clear=False):
            response = self.client.delete("/api/settings/providers/deepseek")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"]["source"], "none")
        self.assertEqual(self.store.get_provider("deepseek"), {})

    def test_env_configured_rejects_settings_override(self):
        env = {**self.clean_env, "DEEPSEEK_API_KEY": "fake-env"}
        with patch.dict(os.environ, env, clear=False):
            response = self.client.post("/api/settings/providers/deepseek", json={"apiKey": "fake-settings"})

        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.store.get_provider("deepseek"), {})
        self.assertNotIn("fake-settings", response.text)

    def test_google_settings_still_requires_project_env(self):
        self.store.set_provider("google", {"apiKey": "fake-key"})
        with patch.dict(os.environ, self.clean_env, clear=False):
            google = provider_by_id(settings_router.get_provider_statuses(), "google")

        self.assertEqual(google["source"], "settings")
        self.assertFalse(google["configured"])
        self.assertEqual(
            google["missingDependencyEnv"],
            ["GOOGLE_CLOUD_PROJECT or GOOGLE_PROJECT_ID or GOOGLE_PROJECT"],
        )

    def test_r2_settings_still_requires_non_secret_env(self):
        self.store.set_provider(
            "cloudflare-r2",
            {"accessKeyId": "fake-access", "secretAccessKey": "fake-secret"},
        )
        env = {
            **self.clean_env,
            "CLOUDFLARE_R2_BUCKET_NAME": "fake-bucket",
            "CLOUDFLARE_R2_PUBLIC_DOMAIN": "https://example.invalid",
            "CLOUDFLARE_R2_ACCOUNT_ID": "fake-account",
        }
        with patch.dict(os.environ, env, clear=False):
            r2 = provider_by_id(settings_router.get_provider_statuses(), "cloudflare-r2")

        self.assertTrue(r2["configured"])
        self.assertEqual(r2["source"], "settings")
        self.assertEqual(r2["missingDependencyEnv"], [])


if __name__ == "__main__":
    unittest.main()
