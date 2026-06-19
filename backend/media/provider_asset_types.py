from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProviderAssetUploadResult:
    provider: str
    source_kind: str
    url: str | None = None
    data_uri: str | None = None
    mime_type: str | None = None
    filename: str | None = None
    size_bytes: int | None = None
    storage: str | None = None
    raw: dict | None = None
