import unittest
from types import SimpleNamespace
from unittest.mock import patch

from engines.specs import get_model_spec
from image_generation.adapters.google_gemini_image_adapter import GoogleGeminiImageAdapter
from image_generation.providers.google_provider import GoogleImageProvider


class FakeAdapter:
    def __init__(self):
        self.calls = []

    async def generate(self, request, model):
        self.calls.append((request, model))
        return "/api/image/google.png"


class FakeModels:
    def __init__(self):
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        inline_data = SimpleNamespace(data=b"image", mime_type="image/png")
        part = SimpleNamespace(inline_data=inline_data, text=None)
        return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])


class GoogleVertexImageProviderTest(unittest.IsolatedAsyncioTestCase):
    async def test_aliases_resolve_to_stable_models(self):
        adapter = FakeAdapter()
        provider = GoogleImageProvider(api_key="test-key")
        provider.adapter = adapter

        for alias, expected in (
            ("Nano 2", "gemini-3.1-flash-image"),
            ("Nano Banana 2", "gemini-3.1-flash-image"),
            ("gemini-3.1-flash-image", "gemini-3.1-flash-image"),
            ("Nano Pro", "gemini-3-pro-image"),
            ("Nano pro", "gemini-3-pro-image"),
            ("Nano Banana Pro", "gemini-3-pro-image"),
            ("gemini-3-pro-image", "gemini-3-pro-image"),
        ):
            with self.subTest(alias=alias):
                request = SimpleNamespace(model=alias, config={})
                await provider.generate(request)
                self.assertEqual(adapter.calls[-1][1], expected)

    async def test_preview_models_are_rejected(self):
        provider = GoogleImageProvider(api_key="test-key")
        provider.adapter = FakeAdapter()

        for model in ("gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"):
            with self.subTest(model=model), self.assertRaisesRegex(ValueError, "not supported"):
                await provider.generate(SimpleNamespace(model=model, config={}))


class GoogleVertexImageAdapterTest(unittest.IsolatedAsyncioTestCase):
    async def test_generate_content_receives_stable_model(self):
        models = FakeModels()
        adapter = GoogleGeminiImageAdapter.__new__(GoogleGeminiImageAdapter)
        adapter.client = SimpleNamespace(models=models)
        request = SimpleNamespace(
            prompt="make an image",
            config={},
            image_inputs=[],
            generation_dir="Z:/project/generation",
        )

        with patch(
            "image_generation.adapters.google_gemini_image_adapter.save_image_bytes",
            return_value="/api/image/google.png",
        ):
            result = await adapter.generate(request, "gemini-3.1-flash-image")

        self.assertEqual(result, "/api/image/google.png")
        self.assertEqual(models.calls[0]["model"], "gemini-3.1-flash-image")


class GoogleImageSpecIsolationTest(unittest.TestCase):
    def test_same_stable_ids_resolve_by_provider(self):
        cloud_flash = get_model_spec("google", "gemini-3.1-flash-image")
        studio_flash = get_model_spec("google_studio", "gemini-3.1-flash-image")
        cloud_pro = get_model_spec("Google", "gemini-3-pro-image")
        studio_pro = get_model_spec("google_studio", "gemini-3-pro-image")

        self.assertIs(cloud_flash, get_model_spec("Google", "Nano 2"))
        self.assertIs(cloud_pro, get_model_spec("Google", "Nano Pro"))
        self.assertEqual(cloud_flash["resolutions"], ["1K", "2K", "4K"])
        self.assertEqual(studio_flash["resolutions"], ["0.5K", "1K", "2K", "4K"])
        self.assertEqual(studio_flash["provider"], "google_studio")
        self.assertEqual(studio_pro["provider"], "google_studio")
        self.assertIsNot(cloud_flash, studio_flash)
        self.assertIsNot(cloud_pro, studio_pro)


if __name__ == "__main__":
    unittest.main()
