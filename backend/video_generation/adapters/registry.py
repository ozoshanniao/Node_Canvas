from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Mapping

from video_generation.adapters.base import LegacyVideoAdapter, VideoProviderAdapter
from video_generation.adapters.errors import VideoProviderAdapterNotFound


LEGACY_VIDEO_ADAPTER_IDS: dict[str, str] = {}
VIDEO_ADAPTER_IDS: dict[str, str] = {
    "yunwu": "yunwu:veo",
    "google": "google:veo",
    "google_omni": "google:omni",
    "kling": "kling:official",
    "yunwu-kling": "yunwu-kling:kling",
    "seedance_official": "seedance:official",
    "kie": "kie:wan",
    **LEGACY_VIDEO_ADAPTER_IDS,
}

_ADAPTERS_BY_PROVIDER: dict[str, VideoProviderAdapter] = {}
_ADAPTERS_BY_ID: dict[str, VideoProviderAdapter] = {}


def register_video_adapter(adapter: VideoProviderAdapter) -> VideoProviderAdapter:
    if not getattr(adapter, "provider", None):
        raise ValueError("Video adapter provider is required")
    if not getattr(adapter, "adapter_id", None):
        raise ValueError("Video adapter adapter_id is required")
    _ADAPTERS_BY_PROVIDER[adapter.provider] = adapter
    _ADAPTERS_BY_ID[adapter.adapter_id] = adapter
    return adapter


def register_legacy_video_adapter(provider: str, adapter_id: str | None = None) -> VideoProviderAdapter:
    return register_video_adapter(LegacyVideoAdapter(provider=provider, adapter_id=adapter_id or legacy_adapter_id_for_provider(provider)))


def get_video_adapter(provider: str) -> VideoProviderAdapter:
    adapter = _ADAPTERS_BY_PROVIDER.get(provider)
    if not adapter:
        raise VideoProviderAdapterNotFound(provider)
    return adapter


def list_video_adapters() -> list[VideoProviderAdapter]:
    return list(_ADAPTERS_BY_PROVIDER.values())


def has_video_adapter(provider: str) -> bool:
    return provider in _ADAPTERS_BY_PROVIDER


@contextmanager
def temporary_video_adapter_registry():
    providers_snapshot = dict(_ADAPTERS_BY_PROVIDER)
    ids_snapshot = dict(_ADAPTERS_BY_ID)
    try:
        yield
    finally:
        _ADAPTERS_BY_PROVIDER.clear()
        _ADAPTERS_BY_PROVIDER.update(providers_snapshot)
        _ADAPTERS_BY_ID.clear()
        _ADAPTERS_BY_ID.update(ids_snapshot)


def legacy_adapter_id_for_provider(provider: str) -> str:
    return VIDEO_ADAPTER_IDS.get(provider, f"legacy:{provider}")


def resolve_adapter_for_capability(capability: Mapping[str, Any]) -> VideoProviderAdapter:
    hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
    adapter_id = hints.get("adapterId")
    if adapter_id and adapter_id in _ADAPTERS_BY_ID:
        return _ADAPTERS_BY_ID[adapter_id]
    return get_video_adapter(str(capability.get("provider") or ""))


def _register_default_legacy_adapters() -> None:
    for provider, adapter_id in LEGACY_VIDEO_ADAPTER_IDS.items():
        if provider not in _ADAPTERS_BY_PROVIDER:
            register_legacy_video_adapter(provider, adapter_id)


def _register_default_adapters() -> None:
    from video_generation.adapters.google_omni import GoogleOmniVideoAdapter
    from video_generation.adapters.google_veo import GoogleVeoVideoAdapter
    from video_generation.adapters.kie import KieVideoAdapter
    from video_generation.adapters.kling import KlingVideoAdapter
    from video_generation.adapters.seedance import SeedanceOfficialVideoAdapter
    from video_generation.adapters.yunwu import YunwuVideoAdapter
    from video_generation.adapters.yunwu_kling import YunwuKlingVideoAdapter

    if "yunwu" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(YunwuVideoAdapter())
    if "google" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(GoogleVeoVideoAdapter())
    if "google_omni" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(GoogleOmniVideoAdapter())
    if "kling" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(KlingVideoAdapter())
    if "yunwu-kling" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(YunwuKlingVideoAdapter())
    if "seedance_official" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(SeedanceOfficialVideoAdapter())
    if "kie" not in _ADAPTERS_BY_PROVIDER:
        register_video_adapter(KieVideoAdapter())


def _restore_default_video_adapters_for_tests() -> None:
    """Test-only helper: reset the process-local adapter registry to defaults."""
    _ADAPTERS_BY_PROVIDER.clear()
    _ADAPTERS_BY_ID.clear()
    _register_default_adapters()
    _register_default_legacy_adapters()


_register_default_adapters()
_register_default_legacy_adapters()
