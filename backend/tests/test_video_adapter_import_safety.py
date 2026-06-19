import importlib
import unittest
from unittest.mock import AsyncMock, patch


class VideoAdapterImportSafetyTest(unittest.TestCase):
    def test_adapter_imports_and_default_registry_have_no_external_side_effects(self):
        with (
            patch("video_generation.providers.google_veo_provider.genai.Client") as google_client,
            patch("video_generation.providers.kling.provider.KlingOfficialClient") as kling_client,
            patch("video_generation.providers.kling.provider.YunwuKlingClient") as yunwu_kling_client,
            patch("video_generation.providers.kling.auth.encode_kling_jwt") as kling_jwt,
            patch("video_generation.providers.seedance_official.client.SeedanceOfficialClient") as seedance_client,
            patch("media.public_asset_service.R2PublicAssetBackend.upload", new_callable=AsyncMock) as r2_upload,
            patch("media.public_asset_service.TOSPublicAssetBackend.upload", new_callable=AsyncMock) as tos_upload,
        ):
            modules = [
                "video_generation.adapters.yunwu",
                "video_generation.adapters.google_veo",
                "video_generation.adapters.kling",
                "video_generation.adapters.yunwu_kling",
                "video_generation.adapters.seedance",
                "video_generation.providers.kie.client",
                "video_generation.providers.kie.payloads",
                "video_generation.adapters.kie",
                "video_generation.adapters.registry",
            ]
            for module_name in modules:
                importlib.import_module(module_name)

            registry = importlib.import_module("video_generation.adapters.registry")
            registry._restore_default_video_adapters_for_tests()
            adapters = registry.list_video_adapters()
            seedance = registry.resolve_adapter_for_capability({
                "provider": "seedance_official",
                "adapterHints": {"adapterId": "seedance:official"},
            })

        self.assertEqual(
            {adapter.provider for adapter in adapters},
            {"yunwu", "google", "kling", "yunwu-kling", "seedance_official", "kie"},
        )
        self.assertEqual(seedance.adapter_id, "seedance:official")
        google_client.assert_not_called()
        kling_client.assert_not_called()
        yunwu_kling_client.assert_not_called()
        kling_jwt.assert_not_called()
        seedance_client.assert_not_called()
        r2_upload.assert_not_called()
        tos_upload.assert_not_called()

    def test_seedance_adapter_lazy_provider_initialization(self):
        with patch("video_generation.adapters.seedance.SeedanceOfficialProvider") as provider:
            module = importlib.import_module("video_generation.adapters.seedance")
            adapter = module.SeedanceOfficialVideoAdapter()

        self.assertEqual(adapter.provider, "seedance_official")
        provider.assert_not_called()

    def test_phase6_media_imports_have_no_external_side_effects(self):
        with (
            patch("media.public_asset_service.R2PublicAssetBackend.upload", new_callable=AsyncMock) as r2_upload,
            patch("media.public_asset_service.TOSPublicAssetBackend.upload", new_callable=AsyncMock) as tos_upload,
        ):
            for module_name in (
                "media.kie_asset_uploader",
                "media.fal_asset_uploader",
                "media.wavespeed_asset_uploader",
                "media.provider_asset_uploader",
            ):
                importlib.import_module(module_name)

        r2_upload.assert_not_called()
        tos_upload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
