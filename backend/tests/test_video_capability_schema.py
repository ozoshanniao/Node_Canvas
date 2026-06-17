import json
import unittest

from fastapi.testclient import TestClient

from video_generation.capabilities import (
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

    def test_existing_provider_families_are_covered(self):
        covered = {(capability["provider"], capability["family"]) for capability in self.capabilities}

        self.assertIn(("yunwu", "veo"), covered)
        self.assertIn(("google", "veo"), covered)
        self.assertIn(("kling", "kling"), covered)
        self.assertIn(("yunwu-kling", "kling"), covered)
        self.assertIn(("seedance_official", "seedance"), covered)


if __name__ == "__main__":
    unittest.main()
