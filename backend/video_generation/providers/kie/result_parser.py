from __future__ import annotations

import json
from typing import Any

from video_generation.adapters.types import VideoAdapterStatus


def _data(response: dict[str, Any]) -> dict[str, Any]:
    data = response.get("data")
    return data if isinstance(data, dict) else response


def normalize_kie_status(raw_status: str | None) -> VideoAdapterStatus:
    value = str(raw_status or "").strip().lower()
    if value in {"waiting", "queuing", "queued", "generating", "processing", "running"}:
        return "running"
    if value in {"success", "completed", "succeeded"}:
        return "succeeded"
    if value in {"fail", "failed", "error"}:
        return "failed"
    return "unknown"


def extract_kie_task_id(response: dict[str, Any]) -> str:
    data = _data(response)
    for key in ("taskId", "task_id", "id"):
        value = data.get(key)
        if value:
            return str(value)
    raise ValueError("KIE create response did not include a task id")


def _result_json_data(data: dict[str, Any]) -> dict[str, Any]:
    value = data.get("resultJson")
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _first_url(value: Any) -> str | None:
    if isinstance(value, list) and value:
        first = value[0]
        return str(first) if first else None
    if isinstance(value, str) and value:
        return value
    return None


def extract_kie_video_url(response: dict[str, Any]) -> str | None:
    data = _data(response)
    result_json = _result_json_data(data)
    for source, key in (
        (result_json, "resultUrls"),
        (data, "resultUrls"),
    ):
        value = _first_url(source.get(key))
        if value:
            return value
    for key in ("videoUrl", "video_url", "output", "imageUrl", "image_url", "url"):
        value = data.get(key)
        if value:
            return str(value)
    return None


def extract_kie_error_message(response: dict[str, Any]) -> str:
    data = _data(response)
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    for source, key in (
        (data, "failMsg"),
        (data, "errorMessage"),
        (result, "error"),
        (result, "message"),
        (response, "msg"),
        (response, "message"),
    ):
        value = source.get(key) if isinstance(source, dict) else None
        if value:
            return str(value)
    return "Generation failed"
