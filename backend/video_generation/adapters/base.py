from __future__ import annotations

from typing import Any, Mapping, Protocol, runtime_checkable

from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoQueryRequest,
    VideoQueryResult,
)


@runtime_checkable
class VideoProviderAdapter(Protocol):
    provider: str
    adapter_id: str

    def supports(self, capability: Mapping[str, Any]) -> bool:
        ...

    def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        ...

    def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        ...

    def query(self, request: VideoQueryRequest, capability: Mapping[str, Any]) -> VideoQueryResult:
        ...


class LegacyVideoAdapter:
    def __init__(self, provider: str, adapter_id: str):
        self.provider = provider
        self.adapter_id = adapter_id

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability, Mapping) else {}
        return (
            capability.get("provider") == self.provider
            or hints.get("adapterId") == self.adapter_id
        )

    def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        raise NotImplementedError("Legacy runtime path is still used in Phase 5.0")

    def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        raise NotImplementedError("Legacy runtime path is still used in Phase 5.0")

    def query(self, request: VideoQueryRequest, capability: Mapping[str, Any]) -> VideoQueryResult:
        raise NotImplementedError("Legacy runtime path is still used in Phase 5.0")
