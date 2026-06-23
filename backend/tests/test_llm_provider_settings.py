import os
import unittest
from unittest.mock import patch

from llm.providers.anthropic_provider import AnthropicLLMProvider
from llm.providers.base import LLMProviderError
from llm.providers.deepseek_provider import DeepSeekLLMProvider
from llm.providers.openai_provider import OpenAILLMProvider
from llm.providers.yunwu_provider import YunwuLLMProvider
from settings_resolver import resolve_provider_secret, resolve_provider_setting


class FakeSettingsStore:
    def __init__(self, providers=None):
        self.providers = providers or {}

    def get_provider(self, provider_id):
        return dict(self.providers.get(provider_id, {}))

    def set_provider(self, provider_id, values):
        self.providers[provider_id] = dict(values)


class ProviderSettingsTest(unittest.TestCase):
    def test_openai_resolver_env_has_priority_over_fake_settings(self):
        store = FakeSettingsStore({"openai": {"apiKey": "settings-openai"}})

        with patch.dict(os.environ, {"OPENAI_API_KEY": "env-openai"}, clear=False):
            value = resolve_provider_secret("openai", "apiKey", "OPENAI_API_KEY", store)

        self.assertEqual(value, "env-openai")
        self.assertNotEqual(value, "settings-openai")

    def test_openai_resolver_uses_fake_settings_when_env_is_missing(self):
        store = FakeSettingsStore({"openai": {"apiKey": "settings-openai"}})

        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False):
            value = resolve_provider_secret("openai", "apiKey", "OPENAI_API_KEY", store)

        self.assertEqual(value, "settings-openai")

    def test_openai_base_url_uses_fake_settings_when_env_is_missing(self):
        store = FakeSettingsStore({
            "openai": {
                "apiKey": "settings-openai",
                "baseUrl": "https://proxy.example.test/v1",
            }
        })

        with patch.dict(os.environ, {"OPENAI_BASE_URL": ""}, clear=False):
            value = resolve_provider_setting(
                "openai",
                "baseUrl",
                "OPENAI_BASE_URL",
                "https://api.openai.com/v1",
                store,
            )

        self.assertEqual(value, "https://proxy.example.test/v1")

    def test_openai_base_url_default_is_used_when_env_and_settings_are_missing(self):
        store = FakeSettingsStore({"openai": {"apiKey": "settings-openai"}})

        with patch.dict(os.environ, {"OPENAI_BASE_URL": ""}, clear=False):
            value = resolve_provider_setting(
                "openai",
                "baseUrl",
                "OPENAI_BASE_URL",
                "https://api.openai.com/v1",
                store,
            )

        self.assertEqual(value, "https://api.openai.com/v1")

    def test_anthropic_resolver_env_has_priority_over_fake_settings(self):
        store = FakeSettingsStore({"anthropic": {"apiKey": "settings-anthropic"}})

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "env-anthropic"}, clear=False):
            value = resolve_provider_secret("anthropic", "apiKey", "ANTHROPIC_API_KEY", store)

        self.assertEqual(value, "env-anthropic")
        self.assertNotEqual(value, "settings-anthropic")

    def test_anthropic_resolver_uses_fake_settings_when_env_is_missing(self):
        store = FakeSettingsStore({"anthropic": {"apiKey": "settings-anthropic"}})

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False):
            value = resolve_provider_secret("anthropic", "apiKey", "ANTHROPIC_API_KEY", store)

        self.assertEqual(value, "settings-anthropic")

    def test_provider_headers_use_patched_resolvers_without_real_settings(self):
        with patch("llm.providers.openai_provider.resolve_provider_secret", return_value="settings-openai"):
            openai_headers = OpenAILLMProvider()._headers()
        with patch("llm.providers.anthropic_provider.resolve_provider_secret", return_value="settings-anthropic"):
            anthropic_headers = AnthropicLLMProvider()._headers()

        self.assertEqual(openai_headers["Authorization"], "Bearer settings-openai")
        self.assertEqual(anthropic_headers["x-api-key"], "settings-anthropic")

    def test_missing_provider_credentials_are_clear_without_leaking_fake_keys(self):
        with patch("llm.providers.openai_provider.resolve_provider_secret", return_value=None):
            with self.assertRaises(LLMProviderError) as openai_ctx:
                OpenAILLMProvider()._headers()
        with patch("llm.providers.anthropic_provider.resolve_provider_secret", return_value=None):
            with self.assertRaises(LLMProviderError) as anthropic_ctx:
                AnthropicLLMProvider()._headers()

        self.assertIn("Settings -> Providers", str(openai_ctx.exception))
        self.assertIn("Settings -> Providers", str(anthropic_ctx.exception))
        self.assertNotIn("settings-openai", str(openai_ctx.exception))
        self.assertNotIn("settings-anthropic", str(anthropic_ctx.exception))

    def test_existing_deepseek_and_yunwu_resolvers_can_use_fake_settings(self):
        deepseek_store = FakeSettingsStore({"deepseek": {"apiKey": "settings-deepseek"}})
        yunwu_store = FakeSettingsStore({"yunwu": {"apiKey": "settings-yunwu"}})

        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}, clear=False):
            deepseek_key = resolve_provider_secret("deepseek", "apiKey", "DEEPSEEK_API_KEY", deepseek_store)
        with patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False):
            yunwu_key = resolve_provider_secret("yunwu", "apiKey", "YUNWU_API_KEY", yunwu_store)

        self.assertEqual(deepseek_key, "settings-deepseek")
        self.assertEqual(yunwu_key, "settings-yunwu")

    def test_existing_provider_header_tests_do_not_read_real_settings(self):
        with patch("llm.providers.deepseek_provider.resolve_provider_secret", return_value="settings-deepseek"):
            deepseek_headers = DeepSeekLLMProvider()._headers()
        with patch("llm.providers.yunwu_provider.resolve_provider_secret", return_value="settings-yunwu"):
            yunwu_headers = YunwuLLMProvider()._headers()

        self.assertEqual(deepseek_headers["Authorization"], "Bearer settings-deepseek")
        self.assertEqual(yunwu_headers["Authorization"], "Bearer settings-yunwu")


if __name__ == "__main__":
    unittest.main()
