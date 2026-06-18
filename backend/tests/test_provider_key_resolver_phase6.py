import os
import unittest
from unittest.mock import patch

import settings_router
from settings_resolver import resolve_provider_secret


class InMemorySettingsStore:
    def __init__(self):
        self.providers = {}

    def get_provider(self, provider_id):
        return self.providers.get(provider_id, {})

    def set_provider(self, provider_id, values):
        self.providers[provider_id] = dict(values)


class ProviderKeyResolverPhase6Test(unittest.TestCase):
    def test_resolves_phase6_provider_keys_from_env(self):
        env = {
            "KIE_API_KEY": "fake-kie-env",
            "FAL_API_KEY": "fake-fal-env",
            "WAVESPEED_API_KEY": "fake-wavespeed-env",
        }
        with patch.dict(os.environ, env, clear=False):
            self.assertEqual(resolve_provider_secret("kie", "apiKey", "KIE_API_KEY"), "fake-kie-env")
            self.assertEqual(resolve_provider_secret("fal", "apiKey", "FAL_API_KEY"), "fake-fal-env")
            self.assertEqual(resolve_provider_secret("wavespeed", "apiKey", "WAVESPEED_API_KEY"), "fake-wavespeed-env")

    def test_resolves_phase6_provider_keys_from_settings_when_env_missing(self):
        store = InMemorySettingsStore()
        store.set_provider("kie", {"apiKey": "fake-kie-settings"})
        store.set_provider("fal", {"apiKey": "fake-fal-settings"})
        store.set_provider("wavespeed", {"apiKey": "fake-wavespeed-settings"})

        with patch.dict(os.environ, {"KIE_API_KEY": "", "FAL_API_KEY": "", "WAVESPEED_API_KEY": ""}, clear=False):
            self.assertEqual(resolve_provider_secret("kie", "apiKey", "KIE_API_KEY", store), "fake-kie-settings")
            self.assertEqual(resolve_provider_secret("fal", "apiKey", "FAL_API_KEY", store), "fake-fal-settings")
            self.assertEqual(resolve_provider_secret("wavespeed", "apiKey", "WAVESPEED_API_KEY", store), "fake-wavespeed-settings")

    def test_missing_phase6_provider_key_returns_none(self):
        store = InMemorySettingsStore()
        with patch.dict(os.environ, {"KIE_API_KEY": "", "FAL_API_KEY": "", "WAVESPEED_API_KEY": ""}, clear=False):
            self.assertIsNone(resolve_provider_secret("kie", "apiKey", "KIE_API_KEY", store))
            self.assertIsNone(resolve_provider_secret("fal", "apiKey", "FAL_API_KEY", store))
            self.assertIsNone(resolve_provider_secret("wavespeed", "apiKey", "WAVESPEED_API_KEY", store))

    def test_settings_statuses_include_phase6_providers_without_secret_values(self):
        store = InMemorySettingsStore()
        store.set_provider("kie", {"apiKey": "fake-kie-settings"})
        store.set_provider("fal", {"apiKey": "fake-fal-settings"})
        store.set_provider("wavespeed", {"apiKey": "fake-wavespeed-settings"})

        with patch.dict(os.environ, {"KIE_API_KEY": "", "FAL_API_KEY": "", "WAVESPEED_API_KEY": ""}, clear=False):
            statuses = settings_router.get_provider_statuses(store)

        by_id = {status["id"]: status for status in statuses}
        for provider_id, secret in (
            ("kie", "fake-kie-settings"),
            ("fal", "fake-fal-settings"),
            ("wavespeed", "fake-wavespeed-settings"),
        ):
            self.assertEqual(by_id[provider_id]["source"], "settings")
            self.assertTrue(by_id[provider_id]["configured"])
            self.assertNotIn(secret, str(by_id[provider_id]))


if __name__ == "__main__":
    unittest.main()
