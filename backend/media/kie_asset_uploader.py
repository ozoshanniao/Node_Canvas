from __future__ import annotations

import os
from typing import Any

import httpx


KIE_UPLOAD_BASE_URL = "https://api.kie.ai"
# Pending verification against KIE's official file-upload contract. Kept configurable for Phase 6.0.
KIE_UPLOAD_ENDPOINT = "/api/file-upload"


def _extract_upload_url(payload: dict[str, Any]) -> str | None:
    candidates = [
        payload.get("url"),
        payload.get("file_url"),
        payload.get("fileUrl"),
        payload.get("cdn_url"),
        payload.get("cdnUrl"),
    ]
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    candidates.extend([
        data.get("url"),
        data.get("file_url"),
        data.get("fileUrl"),
        data.get("cdn_url"),
        data.get("cdnUrl"),
    ])
    for value in candidates:
        if value:
            return str(value)
    return None


async def upload_to_kie_cdn(
    *,
    data: bytes,
    filename: str,
    mime_type: str,
    api_key: str,
    upload_cn: bool | None = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    if not api_key:
        raise ValueError("KIE credentials are not configured")
    base_url = (os.getenv("KIE_UPLOAD_BASE_URL") or KIE_UPLOAD_BASE_URL).rstrip("/")
    endpoint = os.getenv("KIE_UPLOAD_ENDPOINT") or KIE_UPLOAD_ENDPOINT
    url = f"{base_url}/{endpoint.strip('/')}"
    headers = {"Authorization": f"Bearer {api_key}"}
    data_fields = {}
    if upload_cn is not None:
        data_fields["upload_cn"] = "true" if upload_cn else "false"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            headers=headers,
            data=data_fields or None,
            files={"file": (filename, data, mime_type)},
        )
        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text}
        if response.is_error:
            raise ValueError(f"KIE asset upload failed with HTTP {response.status_code}: {payload.get('message') or payload}")
        upload_url = _extract_upload_url(payload)
        if not upload_url:
            raise ValueError("KIE asset upload response did not include a file URL")
        return {"url": upload_url, "raw": payload}
