import json
import unittest

from fastapi.testclient import TestClient

from video_generation.capabilities import (
    ALLOWED_PARAMETER_GROUPS,
    STABLE_VIDEO_INPUT_HANDLES,
    build_model_schema_snapshot,
    list_video_model_capabilities,
    validate_model_capability,
)
from video_generation.specs import get_legacy_video_model_specs, get_video_model_specs


class VideoCapabilitySchemaTest(unittest.TestCase):
    def setUp(self):
        self.capabilities = list_video_model_capabilities()

    def test_all_capabilities_validate(self):
        for capability in self.capabilities:
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                validate_model_capability(capability)

    def test_required_model_identity_fields_are_present(self):
        for capability in self.capabilities:
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertTrue(capability["provider"])
                self.assertTrue(capability["model"])
                self.assertTrue(capability["displayName"])
                self.assertEqual(capability["mediaType"], "video")
                self.assertTrue(capability["taskTypes"])

    def test_input_handles_use_stable_port_contract(self):
        stable_handles = set(STABLE_VIDEO_INPUT_HANDLES)
        for capability in self.capabilities:
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertLessEqual(set(capability["inputCapabilities"]), stable_handles)

    def test_every_model_outputs_video(self):
        for capability in self.capabilities:
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertIn("video:out", capability["outputCapabilities"])

    def test_param_lists_reference_existing_parameters(self):
        for capability in self.capabilities:
            params = set(capability["parameters"])
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertLessEqual(set(capability["quickParams"]), params)
                self.assertLessEqual(set(capability["advancedParams"]), params)

    def test_parameter_groups_are_limited_to_schema_groups(self):
        for capability in self.capabilities:
            for key, parameter in capability["parameters"].items():
                with self.subTest(provider=capability["provider"], model=capability["model"], parameter=key):
                    self.assertIn(parameter["group"], ALLOWED_PARAMETER_GROUPS)

    def test_negative_prompt_policy_is_encoded(self):
        for capability in self.capabilities:
            params = capability["parameters"]
            family = capability["family"]
            provider = capability["provider"]
            with self.subTest(provider=provider, model=capability["model"]):
                if provider == "google" and family == "veo":
                    self.assertIn("negativePrompt", params)
                    self.assertEqual(params["negativePrompt"]["group"], "advanced")
                elif provider == "yunwu" and family == "veo":
                    self.assertIn("negativePrompt", params)
                    self.assertEqual(params["negativePrompt"]["group"], "advanced")
                elif family == "kling":
                    self.assertIn("negativePrompt", params)
                    self.assertEqual(params["negativePrompt"]["group"], "advanced")
                elif provider == "seedance_official":
                    self.assertNotIn("negativePrompt", params)

    def test_key_audio_and_last_frame_parameters_are_encoded(self):
        for capability in self.capabilities:
            params = capability["parameters"]
            family = capability["family"]
            provider = capability["provider"]
            with self.subTest(provider=provider, model=capability["model"]):
                if provider == "google" and family == "veo":
                    self.assertIn("generateAudio", params)
                if family in {"seedance", "kling"}:
                    self.assertIn("generateAudio", params)
                if provider == "seedance_official":
                    self.assertIn("returnLastFrame", params)

    def test_snapshot_excludes_adapter_and_sensitive_fields(self):
        blocked_tokens = (
            "adapterHints",
            "hiddenParams",
            "raw schema",
            "apiKey",
            "Authorization",
            "base64",
            "privateKey",
            "accessKey",
        )
        for capability in self.capabilities:
            snapshot = build_model_schema_snapshot(capability)
            serialized = json.dumps(snapshot, ensure_ascii=False)
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertNotIn("adapterHints", snapshot)
                self.assertNotIn("hiddenParams", snapshot)
                for token in blocked_tokens:
                    self.assertNotIn(token.lower(), serialized.lower())

    def test_snapshot_parameter_summary_includes_key_parameters(self):
        for capability in self.capabilities:
            snapshot = build_model_schema_snapshot(capability)
            parameter_summary = snapshot["parameterSummary"]
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                for key in ("aspectRatio", "duration", "resolution", "generateAudio", "seed"):
                    if key in capability["parameters"]:
                        self.assertIn(key, parameter_summary)
                if capability["provider"] == "google":
                    self.assertIn("negativePrompt", parameter_summary)
                self.assertNotIn("adapterHints", parameter_summary)
                self.assertNotIn("hiddenParams", parameter_summary)

    def test_model_specs_return_capability_schema_v1(self):
        specs = get_video_model_specs()

        self.assertEqual(specs["schemaVersion"], 1)
        self.assertIn("providers", specs)
        self.assertIn("models", specs)
        self.assertIn("capabilities", specs)
        self.assertTrue(specs["capabilities"])
        for capability in specs["capabilities"]:
            validate_model_capability(capability)

    def test_model_specs_endpoint_returns_capability_schema_v1(self):
        import main

        response = TestClient(main.app).get("/api/video/model-specs")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertTrue(payload["capabilities"])
        validate_model_capability(payload["capabilities"][0])

    def test_capability_count_covers_existing_provider_models(self):
        legacy_count = sum(
            len(provider.get("models", []))
            for provider in get_legacy_video_model_specs().get("providers", [])
        )

        self.assertGreaterEqual(len(self.capabilities), legacy_count)

    def test_google_omni_capability_is_strict_and_independent(self):
        capability = next(
            item for item in self.capabilities
            if item["provider"] == "google_omni" and item["model"] == "gemini-omni-flash-preview"
        )
        self.assertEqual(capability["displayName"], "Omni Flash")
        self.assertEqual(capability["family"], "gemini_omni")
        self.assertEqual(capability["taskTypes"], ["text-to-video", "image-to-video", "reference-video"])
        self.assertEqual(set(capability["parameters"]), {"videoMode", "aspectRatio", "duration"})
        self.assertEqual(capability["quickParams"], ["videoMode", "aspectRatio", "duration"])
        self.assertEqual(capability["parameters"]["duration"]["options"], [f"{value}s" for value in range(3, 11)])
        self.assertEqual(capability["parameters"]["duration"]["default"], "5s")
        self.assertNotIn("fixedBadges", capability["uiHints"])
        self.assertFalse(capability["uiHints"]["allowCustomParams"])
        inputs = capability["inputCapabilities"]
        self.assertTrue(inputs["image:firstFrame"]["supported"])
        self.assertTrue(inputs["image:firstFrame"]["required"])
        self.assertEqual(inputs["image:firstFrame"]["metadata"]["maxItems"], 1)
        self.assertTrue(inputs["image:references"]["supported"])
        self.assertEqual(inputs["image:references"]["metadata"]["maxItems"], 10)
        for handle in ("image:lastFrame", "video:references", "audio:references", "omniParams:in"):
            self.assertFalse(inputs[handle]["supported"])

    def test_existing_provider_families_are_covered(self):
        covered = {(capability["provider"], capability["family"]) for capability in self.capabilities}

        self.assertIn(("yunwu", "veo"), covered)
        self.assertIn(("google", "veo"), covered)
        self.assertIn(("google_omni", "gemini_omni"), covered)
        self.assertIn(("kling", "kling"), covered)
        self.assertIn(("yunwu-kling", "kling"), covered)
        self.assertIn(("seedance_official", "seedance"), covered)


if __name__ == "__main__":
    unittest.main()
