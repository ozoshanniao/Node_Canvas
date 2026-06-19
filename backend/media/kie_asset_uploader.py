from __future__ import annotations

import base64
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Any

import httpx

from media.provider_asset_types import ProviderAssetUploadResult


KIE_FILE_UPLOAD_BASE_URL = "https://api.kie.ai"
KIE_BASE64_UPLOAD_PATH = "/api/file-base64-upload"
KIE_URL_UPLOAD_PATH = "/api/file-url-upload"
KIE_STREAM_UPLOAD_PATH = "/api/file-stream-upload"


def _base_url(value: str | None = None) -> str:
    return (value or os.getenv("KIE_FILE_UPLOAD_BASE_URL") or KIE_FILE_UPLOAD_BASE_URL).rstrip("/")


def _url(base_url: str | None, path: str) -> str:
    return f"{_base_url(base_url)}{path}"


def _headers(api_key: str) -> dict[str, str]:
    if not api_key:
        raise ValueError("KIE credentials are not configured")
    return {"Authorization": f"Bearer {api_key}"}


def _json_headers(api_key: str) -> dict[str, str]:
    return {**_headers(api_key), "Content-Type": "application/json"}


def _extract_download_url(payload: dict[str, Any]) -> str | None:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    for source, key in (
        (data, "downloadUrl"),
        (data, "download_url"),
        (payload, "downloadUrl"),
        (payload, "download_url"),
        (payload, "url"),
        (payload, "file_url"),
    ):
        value = source.get(key) if isinstance(source, dict) else None
        if value:
            return str(value)
    return None


def _sanitize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return {
        "success": payload.get("success"),
        "code": payload.get("code"),
        "msg": payload.get("msg"),
        "message": payload.get("message"),
        "data": {
            "downloadUrl": data.get("downloadUrl"),
            "download_url": data.get("download_url"),
            "fileName": data.get("fileName") or data.get("file_name"),
            "fileSize": data.get("fileSize") or data.get("file_size"),
        },
    }


def _payload_message(payload: dict[str, Any]) -> str:
    return str(payload.get("msg") or payload.get("message") or payload.get("error") or "Unknown KIE upload error")


def _http_error_message(status_code: int, payload: dict[str, Any]) -> str:
    detail = _payload_message(payload)
    if status_code == 400:
        return f"KIE upload request invalid: {detail}"
    if status_code == 401:
        return f"KIE authentication failed: {detail}"
    if status_code == 405:
        return f"KIE upload method not allowed: {detail}"
    if status_code == 429:
        return f"KIE upload rate limited: {detail}"
    if status_code >= 500:
        return f"KIE upload server error: {detail}"
    return f"KIE upload failed with HTTP {status_code}: {detail}"


def _raise_for_payload_error(payload: dict[str, Any]) -> None:
    if payload.get("success") is False:
        raise ValueError(_payload_message(payload))
    code = payload.get("code")
    if code is not None and str(code) != "200":
        raise ValueError(_payload_message(payload))


def _result(
    *,
    source_kind: str,
    payload: dict[str, Any],
    mime_type: str | None,
    filename: str | None,
    size_bytes: int | None,
) -> ProviderAssetUploadResult:
    download_url = _extract_download_url(payload)
    if not download_url:
        raise ValueError("KIE upload response did not include data.downloadUrl")
    return ProviderAssetUploadResult(
        provider="kie",
        source_kind=source_kind,
        url=download_url,
        mime_type=mime_type,
        filename=filename,
        size_bytes=size_bytes,
        storage="kie",
        raw=_sanitize_payload(payload),
    )


async def _post_json(url: str, api_key: str, body: dict[str, Any], timeout: float) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=_json_headers(api_key), json=body)
    try:
        payload = response.json()
    except ValueError:
        payload = {"msg": response.text}
    if response.is_error:
        raise ValueError(_http_error_message(response.status_code, payload))
    _raise_for_payload_error(payload)
    return payload if isinstance(payload, dict) else {"data": payload}


async def upload_base64_to_kie(
    *,
    base64_data: str,
    upload_path: str,
    filename: str | None,
    api_key: str,
    base_url: str | None = None,
    timeout: float = 60.0,
) -> ProviderAssetUploadResult:
    body = {
        "base64Data": base64_data,
        "uploadPath": upload_path,
        "fileName": filename or _generated_filename(base64_data.encode("utf-8"), "application/octet-stream"),
    }
    payload = await _post_json(_url(base_url, KIE_BASE64_UPLOAD_PATH), api_key, body, timeout)
    return _result(
        source_kind="base64",
        payload=payload,
        mime_type=_mime_from_data_uri(base64_data),
        filename=body["fileName"],
        size_bytes=_base64_size(base64_data),
    )


async def upload_url_to_kie(
    *,
    file_url: str,
    upload_path: str,
    filename: str | None,
    api_key: str,
    base_url: str | None = None,
    timeout: float = 60.0,
) -> ProviderAssetUploadResult:
    body = {
        "fileUrl": file_url,
        "uploadPath": upload_path,
        "fileName": filename or Path(file_url.split("?", 1)[0]).name or "node-canvas.bin",
    }
    payload = await _post_json(_url(base_url, KIE_URL_UPLOAD_PATH), api_key, body, timeout)
    return _result(
        source_kind="url",
        payload=payload,
        mime_type=mimetypes.guess_type(body["fileName"])[0],
        filename=body["fileName"],
        size_bytes=None,
    )


async def upload_stream_to_kie(
    *,
    data: bytes,
    filename: str,
    mime_type: str,
    upload_path: str,
    api_key: str,
    base_url: str | None = None,
    timeout: float = 60.0,
) -> ProviderAssetUploadResult:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            _url(base_url, KIE_STREAM_UPLOAD_PATH),
            headers=_headers(api_key),
            data={"uploadPath": upload_path, "fileName": filename},
            files={"file": (filename, data, mime_type)},
        )
    try:
        payload = response.json()
    except ValueError:
        payload = {"msg": response.text}
    if response.is_error:
        raise ValueError(_http_error_message(response.status_code, payload))
    _raise_for_payload_error(payload)
    return _result(
        source_kind="stream",
        payload=payload,
        mime_type=mime_type,
        filename=filename,
        size_bytes=len(data),
    )


async def upload_to_kie_cdn(
    *,
    asset: Any = None,
    data: bytes | None = None,
    base64_data: str | None = None,
    file_url: str | None = None,
    filename: str | None = None,
    mime_type: str | None = None,
    api_key: str,
    preferred_upload: str | None = None,
    base_url: str | None = None,
    timeout: float = 60.0,
) -> ProviderAssetUploadResult:
    upload_path = _upload_path(mime_type, filename)
    if file_url:
        return await upload_url_to_kie(
            file_url=file_url,
            upload_path=upload_path,
            filename=filename,
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )
    if base64_data and preferred_upload != "stream":
        return await upload_base64_to_kie(
            base64_data=base64_data,
            upload_path=upload_path,
            filename=filename,
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )
    if data is not None:
        actual_mime = mime_type or "application/octet-stream"
        actual_filename = filename or _generated_filename(data, actual_mime)
        return await upload_stream_to_kie(
            data=data,
            filename=actual_filename,
            mime_type=actual_mime,
            upload_path=_upload_path(actual_mime, actual_filename),
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )
    if asset is not None:
        value = str(asset)
        return await upload_base64_to_kie(
            base64_data=value,
            upload_path=upload_path,
            filename=filename,
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )
    raise ValueError("KIE upload requires base64_data, file_url, data, or asset")


def _upload_path(mime_type: str | None, filename: str | None) -> str:
    mime = (mime_type or mimetypes.guess_type(filename or "")[0] or "").lower()
    if mime.startswith("image/"):
        return "images/node-canvas"
    if mime.startswith("video/"):
        return "videos/node-canvas"
    if mime.startswith("audio/"):
        return "audio/node-canvas"
    return "documents/node-canvas"


def _generated_filename(data: bytes, mime_type: str | None) -> str:
    digest = hashlib.sha256(data).hexdigest()[:12]
    extension = mimetypes.guess_extension(mime_type or "") or ".bin"
    return f"node-canvas-{digest}{extension}"


def _mime_from_data_uri(value: str) -> str | None:
    if value.startswith("data:") and "," in value:
        return value.split(",", 1)[0].split(":", 1)[1].split(";", 1)[0] or None
    return None


def _base64_size(value: str) -> int | None:
    payload = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    try:
        return len(base64.b64decode(payload, validate=False))
    except Exception:
        return None
