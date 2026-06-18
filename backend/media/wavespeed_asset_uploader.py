from __future__ import annotations

import os
from typing import Any

import httpx


WAVESPEED_MEDIA_UPLOAD_URL = "https://api.wavespeed.ai/api/v3/media/upload/binary"


def _error_hint(status_code: int, payload: dict[str, Any]) -> str:
    message = payload.get("message") or payload.get("error") or payload
    if status_code == 400:
        return f"WaveSpeed media upload failed: invalid or unsupported file ({message})"
    if status_code == 401:
        return f"WaveSpeed media upload failed: authentication error ({message})"
    if status_code == 413:
        return f"WaveSpeed media upload failed: file is too large ({message})"
    if status_code == 429:
        return f"WaveSpeed media upload failed: rate limited ({message})"
    return f"WaveSpeed media upload failed with HTTP {status_code}: {message}"


def _extract_download_url(payload: dict[str, Any]) -> str | None:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    value = data.get("download_url") or data.get("downloadUrl") or payload.get("download_url")
    return str(value) if value else None


def _sanitize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return {
        "code": payload.get("code"),
        "message": payload.get("message"),
        "data": {
            "type": data.get("type"),
            "download_url": data.get("download_url"),
            "filename": data.get("filename"),
            "size": data.get("size"),
        },
    }


async def upload_to_wavespeed_media(
    *,
    data: bytes,
    filename: str,
    mime_type: str,
    api_key: str,
    timeout: float = 60.0,
) -> dict[str, Any]:
    if not api_key:
        raise ValueError("WaveSpeed credentials are not configured")

    url = os.getenv("WAVESPEED_MEDIA_UPLOAD_URL") or WAVESPEED_MEDIA_UPLOAD_URL
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            headers=headers,
            files={"file": (filename, data, mime_type)},
        )
        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text}

        if response.is_error:
            raise ValueError(_error_hint(response.status_code, payload))

        download_url = _extract_download_url(payload)
        if not download_url:
            raise ValueError("WaveSpeed media upload response did not include data.download_url")

        return {
            "url": download_url,
            "storage": "wavespeed",
            "raw": _sanitize_payload(payload),
        }
