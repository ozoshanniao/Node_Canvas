import unittest

from video_generation.specs import get_video_model_specs


KIE_ALLOWED_MODELS = {
    "wan/2-7",
    "kling-3.0/video",
    "kling-2.6",
    "bytedance/seedance-2",
    "bytedance/seedance-2-fast",
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
    "wan/2-7": "wan",
    "kling-3.0/video": "kling",
    "kling-2.6": "kling",
    "bytedance/seedance-2": "seedance",
    "bytedance/seedance-2-fast": "seedance",
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
        self.assertEqual(
            [model["label"] for model in self.providers["kie"]["models"]],
            [
                "Wan 2.7 (KIE)",
                "Kling 3.0 (KIE)",
                "Kling 2.6 (KIE)",
                "Seedance 2.0 (KIE)",
                "Seedance 2.0 Fast (KIE)",
            ],
        )
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

        wan = by_model["wan/2-7"]["inputCapabilities"]
        self.assertTrue(wan["text:prompt"]["supported"])
        self.assertTrue(wan["image:firstFrame"]["supported"])
        self.assertTrue(wan["image:lastFrame"]["supported"])

        kling26 = by_model["kling-2.6"]["inputCapabilities"]
        self.assertTrue(kling26["text:prompt"]["supported"])
        self.assertTrue(kling26["image:firstFrame"]["supported"])
        self.assertFalse(kling26["image:lastFrame"]["supported"])

        kling30 = by_model["kling-3.0/video"]["inputCapabilities"]
        self.assertTrue(kling30["text:prompt"]["supported"])
        self.assertTrue(kling30["image:firstFrame"]["supported"])
        self.assertTrue(kling30["image:lastFrame"]["supported"])

        for model_id in ("bytedance/seedance-2", "bytedance/seedance-2-fast"):
            capability = by_model[model_id]["inputCapabilities"]
            with self.subTest(model=model_id):
                self.assertTrue(capability["text:prompt"]["supported"])
                self.assertTrue(capability["image:firstFrame"]["supported"])
                self.assertTrue(capability["image:lastFrame"]["supported"])
                self.assertTrue(capability["image:references"]["supported"])
                self.assertTrue(capability["video:references"]["supported"])
                self.assertTrue(capability["audio:references"]["supported"])

    def test_kie_parameter_specs_are_model_family_specific(self):
        by_model = {model["id"]: model for model in self.providers["kie"]["models"]}

        self.assertEqual(by_model["wan/2-7"]["supportedModes"], ["text-to-video", "image-to-video"])
        self.assertEqual(by_model["wan/2-7"]["params"]["duration"]["options"], [f"{value}s" for value in range(2, 16)])
        self.assertEqual(by_model["wan/2-7"]["params"]["resolution"]["options"], ["720p", "1080p"])
        self.assertEqual(by_model["wan/2-7"]["params"]["aspectRatio"]["options"], ["16:9", "9:16", "1:1", "4:3", "3:4"])

        self.assertEqual(by_model["kling-2.6"]["supportedModes"], ["text-to-video", "image-to-video"])
        self.assertEqual(by_model["kling-2.6"]["params"]["duration"]["options"], ["5s", "10s"])
        self.assertEqual(by_model["kling-2.6"]["params"]["aspectRatio"]["options"], ["1:1", "16:9", "9:16"])

        self.assertEqual(by_model["kling-3.0/video"]["supportedModes"], ["text-to-video", "image-to-video"])
        self.assertEqual(by_model["kling-3.0/video"]["params"]["duration"]["options"], [f"{value}s" for value in range(3, 16)])
        self.assertEqual(by_model["kling-3.0/video"]["params"]["qualityMode"]["options"], ["std", "pro", "4K"])
        self.assertEqual(by_model["kling-3.0/video"]["params"]["qualityMode"]["default"], "pro")
        self.assertNotIn("mode", by_model["kling-3.0/video"]["params"])
        self.assertEqual(
            by_model["kling-3.0/video"]["quickParams"],
            ["videoMode", "aspectRatio", "duration", "qualityMode"],
        )

        self.assertEqual(by_model["bytedance/seedance-2"]["supportedModes"], ["text-to-video", "frame", "multimodal-reference"])
        self.assertEqual(by_model["bytedance/seedance-2-fast"]["supportedModes"], ["text-to-video", "frame", "multimodal-reference"])
        self.assertEqual(by_model["bytedance/seedance-2"]["params"]["duration"]["options"], [f"{value}s" for value in range(4, 16)])
        self.assertEqual(by_model["bytedance/seedance-2-fast"]["params"]["duration"]["options"], [f"{value}s" for value in range(4, 16)])
        self.assertEqual(by_model["bytedance/seedance-2-fast"]["params"]["resolution"]["options"], ["480p", "720p"])
        self.assertEqual(by_model["bytedance/seedance-2"]["params"]["aspectRatio"]["label"], "Ratio")
        self.assertEqual(
            by_model["bytedance/seedance-2"]["params"]["aspectRatio"]["options"],
            ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        )

        for model_id in (
            "wan/2-7",
            "kling-2.6",
            "bytedance/seedance-2",
            "bytedance/seedance-2-fast",
        ):
            with self.subTest(model=model_id):
                self.assertNotIn("qualityMode", by_model[model_id]["params"])
                self.assertNotIn("qualityMode", by_model[model_id]["quickParams"])

    def test_excluded_kie_models_are_not_registered(self):
        model_ids = {model["id"] for model in self.providers["kie"]["models"]}
        legacy_suffix_models = {
            "wan/2-7-text-to-video",
            "wan/2-7-image-to-video",
            "kling-2.6/text-to-video",
            "kling-2.6/image-to-video",
            "kling-3.0/video/text-to-video",
            "kling-3.0/video/image-to-video",
            "bytedance/seedance-2/text-to-video",
            "bytedance/seedance-2/image-to-video",
            "bytedance/seedance-2-fast/text-to-video",
            "bytedance/seedance-2-fast/image-to-video",
        }
        for model_id in KIE_EXCLUDED_MODELS | legacy_suffix_models:
            with self.subTest(model=model_id):
                self.assertNotIn(model_id, model_ids)


if __name__ == "__main__":
    unittest.main()
