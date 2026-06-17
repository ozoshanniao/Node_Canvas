from __future__ import annotations

from typing import Any, Mapping

from video_generation.adapters.base import LegacyVideoAdapter, VideoProviderAdapter
from video_generation.adapters.errors import VideoProviderAdapterNotFound


LEGACY_VIDEO_ADAPTER_IDS: dict[str, str] = {
    "yunwu": "legacy:yunwu-veo",
    "google": "legacy:google-veo",
    "kling": "legacy:kling",
    "yunwu-kling": "legacy:yunwu-kling",
    "seedance_official": "legacy:seedance",
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


def legacy_adapter_id_for_provider(provider: str) -> str:
    return LEGACY_VIDEO_ADAPTER_IDS.get(provider, f"legacy:{provider}")


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


_register_default_legacy_adapters()
