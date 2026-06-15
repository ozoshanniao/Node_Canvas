import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from llm.providers.base import LLMProviderError
from llm.providers.deepseek_provider import DeepSeekLLMProvider
from llm.providers.yunwu_provider import YunwuLLMProvider
from settings_store import SettingsStore


def run(coro):
    return asyncio.run(coro)


class ProviderSettingsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SettingsStore(Path(self.temp_dir.name) / "settings.json")
        self.store_patch = patch("settings_resolver.SettingsStore", return_value=self.store)
        self.store_patch.start()

    def tearDown(self):
        self.store_patch.stop()
        self.temp_dir.cleanup()

    def test_deepseek_env_has_priority_over_settings(self):
        self.store.set_provider("deepseek", {"apiKey": "settings-deepseek"})
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "env-deepseek"}, clear=False):
            headers = DeepSeekLLMProvider()._headers()

        self.assertEqual(headers["Authorization"], "Bearer env-deepseek")
        self.assertNotIn("settings-deepseek", str(headers))

    def test_deepseek_uses_settings_when_env_is_missing(self):
        self.store.set_provider("deepseek", {"apiKey": "settings-deepseek"})
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}, clear=False):
            headers = DeepSeekLLMProvider()._headers()

        self.assertEqual(headers["Authorization"], "Bearer settings-deepseek")

    def test_deepseek_missing_credentials_is_clear(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}, clear=False):
            with self.assertRaisesRegex(LLMProviderError, "Settings -> Providers"):
                DeepSeekLLMProvider()._headers()

    def test_yunwu_llm_env_has_priority_over_settings(self):
        self.store.set_provider("yunwu", {"apiKey": "settings-yunwu"})
        with patch.dict(os.environ, {"YUNWU_API_KEY": "env-yunwu"}, clear=False):
            headers = YunwuLLMProvider()._headers()

        self.assertEqual(headers["Authorization"], "Bearer env-yunwu")
        self.assertNotIn("settings-yunwu", str(headers))

    def test_yunwu_llm_uses_settings_when_env_is_missing(self):
        self.store.set_provider("yunwu", {"apiKey": "settings-yunwu"})
        with patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False):
            headers = YunwuLLMProvider()._headers()

        self.assertEqual(headers["Authorization"], "Bearer settings-yunwu")

    def test_yunwu_llm_missing_credentials_is_clear(self):
        with patch.dict(os.environ, {"YUNWU_API_KEY": ""}, clear=False):
            with self.assertRaisesRegex(LLMProviderError, "Settings -> Providers"):
                YunwuLLMProvider()._headers()


if __name__ == "__main__":
    unittest.main()
