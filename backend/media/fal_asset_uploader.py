from __future__ import annotations

import os
from typing import Any

import httpx


# Pending verification against FAL's latest storage endpoint. Kept configurable for Phase 6.0.
FAL_UPLOAD_INITIATE_URL = "https://fal.run/storage/upload/initiate"


def _extract_initiate_fields(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    upload_url = data.get("upload_url") or data.get("uploadUrl") or data.get("url")
    file_url = data.get("file_url") or data.get("fileUrl") or data.get("public_url") or data.get("publicUrl")
    return (str(upload_url) if upload_url else None, str(file_url) if file_url else None)


async def upload_to_fal_cdn(
    *,
    data: bytes,
    filename: str,
    mime_type: str,
    api_key: str,
    timeout: float = 60.0,
) -> dict[str, Any]:
    if not api_key:
        raise ValueError("FAL credentials are not configured")
    initiate_url = os.getenv("FAL_UPLOAD_INITIATE_URL") or FAL_UPLOAD_INITIATE_URL
    headers = {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        initiate = await client.post(
            initiate_url,
            headers=headers,
            json={"filename": filename, "content_type": mime_type},
        )
        try:
            initiate_payload = initiate.json()
        except ValueError:
            initiate_payload = {"message": initiate.text}
        if initiate.is_error:
            raise ValueError(f"FAL asset upload initiate failed with HTTP {initiate.status_code}: {initiate_payload.get('message') or initiate_payload}")
        upload_url, file_url = _extract_initiate_fields(initiate_payload)
        if not upload_url or not file_url:
            raise ValueError("FAL asset upload initiate response must include upload_url and file_url")

        upload = await client.put(upload_url, content=data, headers={"Content-Type": mime_type})
        if upload.is_error:
            raise ValueError(f"FAL asset binary upload failed with HTTP {upload.status_code}")
        return {"url": file_url, "raw": initiate_payload}
