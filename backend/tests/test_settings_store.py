import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from settings_resolver import resolve_provider_secret
from settings_store import SettingsStore, get_default_settings_path


class SettingsStoreTest(unittest.TestCase):
    def test_store_saves_and_clears_provider_atomically(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "settings.json"
            store = SettingsStore(path)
            store.set_provider("deepseek", {"apiKey": "fake-key"})

            self.assertEqual(store.get_provider("deepseek"), {"apiKey": "fake-key"})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["providers"]["deepseek"]["apiKey"], "fake-key")
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

            store.clear_provider("deepseek")
            self.assertEqual(store.get_provider("deepseek"), {})

    def test_resolver_prefers_env_then_settings(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = SettingsStore(Path(temp_dir) / "settings.json")
            store.set_provider("deepseek", {"apiKey": "settings-fake"})

            with patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}, clear=False):
                self.assertEqual(
                    resolve_provider_secret("deepseek", "apiKey", "DEEPSEEK_API_KEY", store),
                    "settings-fake",
                )
            with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "env-fake"}, clear=False):
                self.assertEqual(
                    resolve_provider_secret("deepseek", "apiKey", "DEEPSEEK_API_KEY", store),
                    "env-fake",
                )

    def test_default_path_is_outside_repository_workspace(self):
        repository_root = Path(__file__).resolve().parents[2]
        default_path = get_default_settings_path().resolve()
        self.assertFalse(default_path.is_relative_to(repository_root))


if __name__ == "__main__":
    unittest.main()
