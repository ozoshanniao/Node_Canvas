import unittest

from engines.specs import get_frontend_specs


KIE_IMAGE_MODELS = {
    "Nano Banana Pro (KIE)",
    "Nano Banana 2 (KIE)",
}

DEFERRED_OR_EXCLUDED = {
    "GPT Image 2 (KIE)",
    "gpt-image-2",
    "google/imagen4",
    "google/imagen4-fast",
    "google/imagen4-ultra",
    "veo3/text-to-video",
    "veo3/image-to-video",
    "grok-imagine/text-to-image",
    "wan/2-7-image",
    "flux-2/pro-text-to-image",
    "seedream/4.5-text-to-image",
}


class KieImageCapabilitiesTest(unittest.TestCase):
    def setUp(self):
        self.specs = get_frontend_specs()
        self.providers = self.specs["providers"]
        self.models = self.specs["models"]

    def test_kie_provider_registers_selected_image_models(self):
        self.assertIn("KIE", self.providers)
        self.assertEqual(set(self.providers["KIE"]), KIE_IMAGE_MODELS)

    def test_kie_image_models_have_required_metadata(self):
        for model_name in KIE_IMAGE_MODELS:
            with self.subTest(model=model_name):
                model = self.models[model_name]
                self.assertEqual(model["provider"], "kie")
                self.assertEqual(model["mediaType"], "image")
                self.assertEqual(model["family"], "nano-banana")
                self.assertTrue(model["featured"])
                self.assertFalse(model["experimental"])
                self.assertIn("(KIE)", model["label"])
                self.assertIn("text-to-image", model["taskTypes"])
                self.assertIn("image-to-image", model["taskTypes"])
                self.assertTrue(model["supports_reference"])

    def test_gpt_image_2_is_deferred_without_exact_kie_model_id(self):
        self.assertNotIn("GPT Image 2 (KIE)", self.providers.get("KIE", []))
        serialized = str(self.specs)
        self.assertNotIn("gpt-image-2", serialized)

    def test_excluded_models_are_not_registered_under_kie(self):
        kie_models = set(self.providers.get("KIE", []))
        serialized_kie = " ".join(kie_models)
        for model_id in DEFERRED_OR_EXCLUDED:
            with self.subTest(model=model_id):
                self.assertNotIn(model_id, serialized_kie)

    def test_kie_video_models_are_unchanged_by_image_registry(self):
        serialized_kie_image = " ".join(self.providers["KIE"])
        self.assertNotIn("kling-3.0/video/text-to-video", serialized_kie_image)
        self.assertNotIn("bytedance/seedance-2/text-to-video", serialized_kie_image)


if __name__ == "__main__":
    unittest.main()
