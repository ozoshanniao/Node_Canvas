import importlib
import unittest
from unittest.mock import patch


class ImageAdapterImportSafetyTest(unittest.TestCase):
    def test_kie_image_imports_have_no_external_side_effects(self):
        with patch("settings_resolver.resolve_provider_secret") as resolve_secret:
            for module_name in (
                "image_generation.providers.kie.payloads",
                "image_generation.providers.kie.result_parser",
                "image_generation.adapters.kie",
                "image_generation.providers.kie.provider",
            ):
                with self.subTest(module=module_name):
                    importlib.import_module(module_name)

        resolve_secret.assert_not_called()


if __name__ == "__main__":
    unittest.main()
