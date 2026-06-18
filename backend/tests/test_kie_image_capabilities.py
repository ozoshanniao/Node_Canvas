import unittest

from engines.specs import get_frontend_specs


KIE_IMAGE_MODELS = {
    "Nano Banana Pro (KIE)",
    "Nano Banana 2 (KIE)",
    "GPT Image 2 (KIE)",
    "GPT Image 2 I2I (KIE)",
}

DEFERRED_OR_EXCLUDED = {
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

EXPECTED_MODEL_IDS = {
    "Nano Banana Pro (KIE)": "nano-banana-pro",
    "Nano Banana 2 (KIE)": "nano-banana-2",
    "GPT Image 2 (KIE)": "gpt-image-2-text-to-image",
    "GPT Image 2 I2I (KIE)": "gpt-image-2-image-to-image",
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
                self.assertEqual(model["id"], EXPECTED_MODEL_IDS[model_name])
                self.assertIn(model["family"], {"nano-banana", "gpt-image"})
                self.assertTrue(model["featured"])
                self.assertFalse(model["experimental"])
                self.assertIn("(KIE)", model["label"])
                if model_name == "GPT Image 2 (KIE)":
                    self.assertEqual(model["taskTypes"], ["text-to-image"])
                    self.assertFalse(model["supports_reference"])
                    self.assertNotIn("internalImageInputField", model)
                elif model_name == "GPT Image 2 I2I (KIE)":
                    self.assertEqual(model["taskTypes"], ["image-to-image"])
                    self.assertEqual(model["internalImageInputField"], "input_urls")
                    self.assertEqual(model["maxImages"], 16)
                    self.assertTrue(model["supports_reference"])
                else:
                    self.assertIn("text-to-image", model["taskTypes"])
                    self.assertIn("image-to-image", model["taskTypes"])
                    self.assertTrue(model["supports_reference"])
                    self.assertEqual(model["internalImageInputField"], "image_input")
                    if model_name == "Nano Banana Pro (KIE)":
                        self.assertEqual(model["maxImages"], 8)
                        self.assertEqual(model["promptMaxLength"], 10000)
                    if model_name == "Nano Banana 2 (KIE)":
                        self.assertEqual(model["maxImages"], 14)
                        self.assertEqual(model["promptMaxLength"], 20000)

    def test_gpt_image_2_models_are_registered_with_distinct_task_types(self):
        t2i = self.models["GPT Image 2 (KIE)"]
        i2i = self.models["GPT Image 2 I2I (KIE)"]

        self.assertEqual(t2i["id"], "gpt-image-2-text-to-image")
        self.assertEqual(i2i["id"], "gpt-image-2-image-to-image")
        self.assertEqual(t2i["taskTypes"], ["text-to-image"])
        self.assertEqual(i2i["taskTypes"], ["image-to-image"])
        self.assertEqual(i2i["internalImageInputField"], "input_urls")

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
