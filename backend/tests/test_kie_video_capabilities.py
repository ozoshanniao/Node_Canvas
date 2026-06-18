import unittest

from video_generation.specs import get_video_model_specs


KIE_ALLOWED_MODELS = {
    "wan/2-7-text-to-video",
    "wan/2-7-image-to-video",
    "kling-3.0/video/text-to-video",
    "kling-3.0/video/image-to-video",
    "kling-2.6/text-to-video",
    "kling-2.6/image-to-video",
    "bytedance/seedance-2/text-to-video",
    "bytedance/seedance-2/image-to-video",
    "bytedance/seedance-2-fast/text-to-video",
    "bytedance/seedance-2-fast/image-to-video",
}

KIE_EXCLUDED_MODELS = {
    "veo3/text-to-video",
    "veo3/image-to-video",
    "veo3-fast/text-to-video",
    "veo3-fast/image-to-video",
    "google/imagen4",
    "google/imagen4-fast",
    "google/imagen4-ultra",
    "wan/2-7-image",
    "gpt-image",
    "gemini-omni-video",
    "gemini/omni-video",
    "nano-banana-pro",
    "nano-banana-2",
}

KIE_MODEL_FAMILIES = {
    "wan/2-7-text-to-video": "wan",
    "wan/2-7-image-to-video": "wan",
    "kling-3.0/video/text-to-video": "kling",
    "kling-3.0/video/image-to-video": "kling",
    "kling-2.6/text-to-video": "kling",
    "kling-2.6/image-to-video": "kling",
    "bytedance/seedance-2/text-to-video": "seedance",
    "bytedance/seedance-2/image-to-video": "seedance",
    "bytedance/seedance-2-fast/text-to-video": "seedance",
    "bytedance/seedance-2-fast/image-to-video": "seedance",
}


class KieVideoCapabilitiesTest(unittest.TestCase):
    def setUp(self):
        self.specs = get_video_model_specs()
        self.providers = {provider["id"]: provider for provider in self.specs["providers"]}
        self.capabilities = [
            capability for capability in self.specs["capabilities"]
            if capability["provider"] == "kie"
        ]

    def test_kie_provider_is_registered(self):
        self.assertIn("kie", self.providers)

    def test_kie_only_registers_selected_video_models(self):
        model_ids = {model["id"] for model in self.providers["kie"]["models"]}

        self.assertEqual(model_ids, KIE_ALLOWED_MODELS)
        for model in self.providers["kie"]["models"]:
            with self.subTest(model=model["id"]):
                self.assertIn("(KIE)", model["label"])

    def test_kie_capabilities_are_adapter_runtime(self):
        self.assertEqual({capability["model"] for capability in self.capabilities}, KIE_ALLOWED_MODELS)
        for capability in self.capabilities:
            with self.subTest(model=capability["model"]):
                self.assertEqual(capability["family"], KIE_MODEL_FAMILIES[capability["model"]])
                self.assertTrue(capability["featured"])
                self.assertFalse(capability["experimental"])
                self.assertEqual(capability["adapterHints"]["adapterId"], "kie:wan")
                self.assertEqual(capability["adapterHints"]["runtime"], "adapter")

    def test_kie_t2v_and_i2v_ports(self):
        by_model = {capability["model"]: capability for capability in self.capabilities}

        for model_id in KIE_ALLOWED_MODELS:
            with self.subTest(model=model_id):
                capability = by_model[model_id]
                if model_id.endswith("text-to-video"):
                    self.assertTrue(capability["inputCapabilities"]["text:prompt"]["required"])
                    self.assertFalse(capability["inputCapabilities"]["image:firstFrame"]["supported"])
                else:
                    self.assertFalse(capability["inputCapabilities"]["text:prompt"]["required"])
                    self.assertTrue(capability["inputCapabilities"]["image:firstFrame"]["required"])

    def test_kie_parameter_specs_are_model_family_specific(self):
        by_model = {model["id"]: model for model in self.providers["kie"]["models"]}

        self.assertEqual(by_model["wan/2-7-text-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(2, 16)])
        self.assertEqual(by_model["wan/2-7-image-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(2, 16)])
        self.assertEqual(by_model["wan/2-7-text-to-video"]["params"]["resolution"]["options"], ["720p", "1080p"])

        self.assertEqual(by_model["kling-2.6/text-to-video"]["params"]["duration"]["options"], ["5s", "10s"])
        self.assertEqual(by_model["kling-2.6/image-to-video"]["params"]["duration"]["options"], ["5s", "10s"])

        self.assertEqual(by_model["kling-3.0/video/text-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(3, 16)])
        self.assertEqual(by_model["kling-3.0/video/image-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(3, 16)])
        self.assertEqual(by_model["kling-3.0/video/text-to-video"]["params"]["mode"]["options"], ["std", "pro", "4K"])

        self.assertEqual(by_model["bytedance/seedance-2/text-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(4, 16)])
        self.assertEqual(by_model["bytedance/seedance-2/image-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(4, 16)])
        self.assertEqual(by_model["bytedance/seedance-2-fast/text-to-video"]["params"]["duration"]["options"], [f"{value}s" for value in range(4, 16)])
        self.assertEqual(by_model["bytedance/seedance-2-fast/text-to-video"]["params"]["resolution"]["options"], ["480p", "720p"])

    def test_excluded_kie_models_are_not_registered(self):
        model_ids = {model["id"] for model in self.providers["kie"]["models"]}
        for model_id in KIE_EXCLUDED_MODELS:
            with self.subTest(model=model_id):
                self.assertNotIn(model_id, model_ids)


if __name__ == "__main__":
    unittest.main()
