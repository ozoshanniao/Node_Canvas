import unittest

from video_generation.specs import get_video_model_specs


KIE_ALLOWED_MODELS = {
    "wan/2-7-text-to-video",
    "wan/2-7-image-to-video",
}

KIE_EXCLUDED_MODELS = {
    "veo3/text-to-video",
    "veo3/image-to-video",
    "veo3-fast/text-to-video",
    "veo3-fast/image-to-video",
    "google/imagen4",
    "google/imagen4-fast",
    "google/imagen4-ultra",
    "nano-banana-pro",
    "nano-banana-2",
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

    def test_kie_only_registers_selected_wan_models(self):
        model_ids = {model["id"] for model in self.providers["kie"]["models"]}

        self.assertEqual(model_ids, KIE_ALLOWED_MODELS)

    def test_kie_capabilities_are_adapter_runtime(self):
        self.assertEqual({capability["model"] for capability in self.capabilities}, KIE_ALLOWED_MODELS)
        for capability in self.capabilities:
            with self.subTest(model=capability["model"]):
                self.assertEqual(capability["family"], "wan")
                self.assertTrue(capability["featured"])
                self.assertFalse(capability["experimental"])
                self.assertEqual(capability["adapterHints"]["adapterId"], "kie:wan")
                self.assertEqual(capability["adapterHints"]["runtime"], "adapter")

    def test_kie_t2v_and_i2v_ports(self):
        by_model = {capability["model"]: capability for capability in self.capabilities}

        t2v = by_model["wan/2-7-text-to-video"]
        self.assertTrue(t2v["inputCapabilities"]["text:prompt"]["required"])
        self.assertFalse(t2v["inputCapabilities"]["image:firstFrame"]["supported"])

        i2v = by_model["wan/2-7-image-to-video"]
        self.assertFalse(i2v["inputCapabilities"]["text:prompt"]["required"])
        self.assertTrue(i2v["inputCapabilities"]["image:firstFrame"]["required"])

    def test_excluded_kie_models_are_not_registered(self):
        serialized = str(self.specs)
        for model_id in KIE_EXCLUDED_MODELS:
            with self.subTest(model=model_id):
                self.assertNotIn(model_id, serialized)


if __name__ == "__main__":
    unittest.main()
