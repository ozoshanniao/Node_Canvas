import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

import settings_router


PROVIDER_ENV_NAMES = {
    "DEEPSEEK_API_KEY",
    "GOOGLE_CLOUD_API_KEY",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_PROJECT_ID",
    "GOOGLE_PROJECT",
    "YUNWU_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "ANTHROPIC_API_KEY",
    "KLING_ACCESS_KEY",
    "KLING_SECRET_KEY",
    "ARK_API_KEY",
    "KIE_API_KEY",
    "FAL_API_KEY",
    "WAVESPEED_API_KEY",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_BUCKET_NAME",
    "CLOUDFLARE_R2_PUBLIC_DOMAIN",
    "CLOUDFLARE_R2_ENDPOINT",
    "CLOUDFLARE_R2_ACCOUNT_ID",
}


def provider_by_id(providers, provider_id):
    return next(provider for provider in providers if provider["id"] == provider_id)


def run(coro):
    return asyncio.run(coro)


class InMemorySettingsStore:
    def __init__(self):
        self.providers = {}

    def get_provider(self, provider_id):
        return dict(self.providers.get(provider_id, {}))

    def set_provider(self, provider_id, values):
        self.providers[provider_id] = dict(values)

    def clear_provider(self, provider_id):
        self.providers.pop(provider_id, None)


class ProviderSettingsStatusTest(unittest.TestCase):
    def setUp(self):
        self.store = InMemorySettingsStore()
        self.store_patch = patch.object(settings_router, "SETTINGS_STORE", self.store)
        self.store_patch.start()
        self.clean_env = {name: "" for name in PROVIDER_ENV_NAMES}

    def tearDown(self):
        self.store_patch.stop()

    def test_get_never_returns_secret_values(self):
        fake_secret = "not-a-real-secret-value"
        self.store.set_provider("deepseek", {"apiKey": fake_secret})

        with patch.dict(os.environ, self.clean_env, clear=False):
            response = run(settings_router.get_settings_providers())

        self.assertEqual(response["status"], "success")
        deepseek = provider_by_id(response["providers"], "deepseek")
        self.assertEqual(deepseek["source"], "settings")
        self.assertNotIn(fake_secret, str(response))

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
            response = run(settings_router.save_settings_provider("deepseek", {"apiKey": fake_secret}))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["provider"]["source"], "settings")
        self.assertEqual(self.store.get_provider("deepseek"), {"apiKey": fake_secret})
        self.assertNotIn(fake_secret, str(response))

    def test_post_saves_kling_two_key_provider(self):
        payload = {"accessKey": "fake-access", "secretKey": "fake-secret"}
        with patch.dict(os.environ, self.clean_env, clear=False):
            response = run(settings_router.save_settings_provider("kling", payload))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["provider"]["source"], "settings")
        self.assertEqual(self.store.get_provider("kling"), payload)
        self.assertNotIn(payload["accessKey"], str(response))
        self.assertNotIn(payload["secretKey"], str(response))

    def test_delete_clears_settings_provider(self):
        self.store.set_provider("deepseek", {"apiKey": "fake-key"})
        with patch.dict(os.environ, self.clean_env, clear=False):
            response = run(settings_router.clear_settings_provider("deepseek"))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["provider"]["source"], "none")
        self.assertEqual(self.store.get_provider("deepseek"), {})

    def test_env_configured_rejects_settings_override(self):
        env = {**self.clean_env, "DEEPSEEK_API_KEY": "fake-env"}
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                run(settings_router.save_settings_provider("deepseek", {"apiKey": "fake-settings"}))

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(self.store.get_provider("deepseek"), {})
        self.assertNotIn("fake-settings", str(ctx.exception.detail))

    def test_google_provider_display_name_is_google_cloud_vertex(self):
        with patch.dict(os.environ, self.clean_env, clear=False):
            google = provider_by_id(settings_router.get_provider_statuses(), "google")

        self.assertEqual(google["id"], "google")
        self.assertEqual(google["name"], "Google Cloud / Vertex AI")
        self.assertIn("GOOGLE_CLOUD_API_KEY", google["requiredEnv"])

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


    def test_openai_settings_status_and_base_url_do_not_leak_secret(self):
        fake_secret = "fake-openai-secret"
        self.store.set_provider("openai", {"apiKey": fake_secret, "baseUrl": "https://proxy.example.test/v1/"})

        with patch.dict(os.environ, self.clean_env, clear=False):
            openai = provider_by_id(settings_router.get_provider_statuses(), "openai")

        self.assertEqual(openai["name"], "OpenAI")
        self.assertEqual(openai["source"], "settings")
        self.assertEqual(openai["publicSettings"], {"baseUrl": "https://proxy.example.test/v1"})
        self.assertNotIn(fake_secret, str(openai))

    def test_openai_post_saves_api_key_and_normalized_base_url(self):
        payload = {"apiKey": "fake-openai", "baseUrl": "https://proxy.example.test/v1/"}
        with patch.dict(os.environ, self.clean_env, clear=False):
            response = run(settings_router.save_settings_provider("openai", payload))

        self.assertEqual(response["provider"]["source"], "settings")
        self.assertEqual(self.store.get_provider("openai"), {"apiKey": "fake-openai", "baseUrl": "https://proxy.example.test/v1"})
        self.assertNotIn("fake-openai", str(response))

    def test_openai_post_rejects_invalid_base_url(self):
        with patch.dict(os.environ, self.clean_env, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                run(settings_router.save_settings_provider("openai", {"apiKey": "fake", "baseUrl": "https://user:pass@example.test/v1"}))

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.store.get_provider("openai"), {})

    def test_anthropic_settings_status_does_not_leak_secret(self):
        fake_secret = "fake-claude-secret"
        self.store.set_provider("anthropic", {"apiKey": fake_secret})

        with patch.dict(os.environ, self.clean_env, clear=False):
            anthropic = provider_by_id(settings_router.get_provider_statuses(), "anthropic")

        self.assertEqual(anthropic["name"], "Claude")
        self.assertEqual(anthropic["source"], "settings")
        self.assertNotIn(fake_secret, str(anthropic))

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
