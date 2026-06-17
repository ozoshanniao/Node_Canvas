import unittest
from typing import Any, Mapping

from video_generation.adapters.base import VideoProviderAdapter
from video_generation.adapters.errors import (
    VideoProviderAdapterNotFound,
    classify_video_provider_error,
)
from video_generation.adapters.registry import (
    LEGACY_VIDEO_ADAPTER_IDS,
    get_video_adapter,
    has_video_adapter,
    list_video_adapters,
    register_video_adapter,
    resolve_adapter_for_capability,
    temporary_video_adapter_registry,
)
from video_generation.adapters.google_veo import GoogleVeoVideoAdapter
from video_generation.adapters.yunwu import YunwuVideoAdapter
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoQueryRequest,
    VideoQueryResult,
    normalize_video_adapter_status,
)
from video_generation.capabilities import (
    build_model_schema_snapshot,
    list_video_model_capabilities,
    validate_model_capability,
)


class DummyVideoAdapter:
    provider = "phase5_dummy"
    adapter_id = "test:phase5-dummy"

    def supports(self, capability: Mapping[str, Any]) -> bool:
        return capability.get("provider") == self.provider

    def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        return {"model": request.model, "prompt": request.prompt}

    def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id="task-1",
            status="queued",
        )

    def query(self, request: VideoQueryRequest, capability: Mapping[str, Any]) -> VideoQueryResult:
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status="running",
        )


class VideoProviderAdapterRegistryTest(unittest.TestCase):
    def test_registry_can_register_and_get_adapter(self):
        with temporary_video_adapter_registry():
            adapter = register_video_adapter(DummyVideoAdapter())

            self.assertIs(adapter, get_video_adapter("phase5_dummy"))
            self.assertTrue(has_video_adapter("phase5_dummy"))
            self.assertIsInstance(adapter, VideoProviderAdapter)
        self.assertFalse(has_video_adapter("phase5_dummy"))

    def test_unknown_provider_raises_clear_error(self):
        with self.assertRaises(VideoProviderAdapterNotFound) as context:
            get_video_adapter("missing_provider")

        self.assertIn("No video provider adapter registered", str(context.exception))
        self.assertEqual(context.exception.code, "adapter_not_found")

    def test_list_video_adapters_is_local_registry_only(self):
        adapters = list_video_adapters()

        self.assertTrue(adapters)
        self.assertTrue(all(getattr(adapter, "provider", None) for adapter in adapters))

    def test_resolve_adapter_for_capability_uses_adapter_hints(self):
        capability = {
            "provider": "phase5_dummy",
            "adapterHints": {"adapterId": "test:phase5-dummy", "runtime": "legacy"},
        }

        with temporary_video_adapter_registry():
            register_video_adapter(DummyVideoAdapter())
            adapter = resolve_adapter_for_capability(capability)

        self.assertEqual(adapter.adapter_id, "test:phase5-dummy")

    def test_legacy_adapters_registered_for_existing_providers(self):
        for provider, adapter_id in LEGACY_VIDEO_ADAPTER_IDS.items():
            with self.subTest(provider=provider):
                adapter = get_video_adapter(provider)
                self.assertEqual(adapter.provider, provider)
                self.assertEqual(adapter.adapter_id, adapter_id)

    def test_yunwu_adapter_is_real_adapter(self):
        adapter = get_video_adapter("yunwu")

        self.assertIsInstance(adapter, YunwuVideoAdapter)
        self.assertEqual(adapter.adapter_id, "yunwu:veo")

    def test_google_adapter_is_real_adapter(self):
        adapter = get_video_adapter("google")

        self.assertIsInstance(adapter, GoogleVeoVideoAdapter)
        self.assertEqual(adapter.adapter_id, "google:veo")

    def test_capability_adapter_hints_are_non_sensitive(self):
        sensitive_tokens = ("apikey", "authorization", "bearer", "secret", "accesskey", "privatekey")

        for capability in list_video_model_capabilities():
            hints = capability.get("adapterHints") or {}
            serialized = str(hints).replace("_", "").replace("-", "").lower()
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertIn("adapterId", hints)
                expected_runtime = "adapter" if capability["provider"] in {"yunwu", "google"} else "legacy"
                self.assertEqual(hints.get("runtime"), expected_runtime)
                for token in sensitive_tokens:
                    self.assertNotIn(token, serialized)
                validate_model_capability(capability)

    def test_schema_snapshot_excludes_adapter_hints(self):
        for capability in list_video_model_capabilities():
            snapshot = build_model_schema_snapshot(capability)
            with self.subTest(provider=capability["provider"], model=capability["model"]):
                self.assertNotIn("adapterHints", snapshot)

    def test_status_mapping_helper_normalizes_provider_status(self):
        self.assertEqual(normalize_video_adapter_status("pending"), "queued")
        self.assertEqual(normalize_video_adapter_status("video_generating"), "running")
        self.assertEqual(normalize_video_adapter_status("completed"), "succeeded")
        self.assertEqual(normalize_video_adapter_status("failed"), "failed")
        self.assertEqual(normalize_video_adapter_status("unexpected"), "unknown")

    def test_error_classification_helper(self):
        self.assertEqual(classify_video_provider_error("Invalid API key")[0], "auth_error")
        self.assertEqual(classify_video_provider_error("Google credentials missing")[0], "auth_error")
        self.assertEqual(classify_video_provider_error("quota exceeded")[0], "quota_error")
        self.assertEqual(classify_video_provider_error("too many requests")[0], "rate_limited")
        self.assertEqual(classify_video_provider_error("bad request validation failed")[0], "validation_error")
        self.assertEqual(classify_video_provider_error("network connection reset")[0], "network_error")
        self.assertEqual(classify_video_provider_error("not recognizable")[0], "unknown")


if __name__ == "__main__":
    unittest.main()
