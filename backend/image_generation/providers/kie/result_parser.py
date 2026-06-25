from __future__ import annotations

import json
from typing import Any


def normalize_kie_image_status(raw_status: str | None) -> str:
    status = (raw_status or "").strip().lower()
    if status in {"waiting", "queued", "queuing", "pending", "generating", "processing", "running"}:
        return "running"
    if status in {"success", "succeeded", "completed"}:
        return "succeeded"
    if status in {"fail", "failed", "error", "cancelled", "canceled"}:
        return "failed"
    return "unknown"


def extract_kie_image_task_id(response: dict[str, Any]) -> str:
    data = response.get("data") if isinstance(response.get("data"), dict) else {}
    task_id = data.get("taskId") or data.get("task_id") or response.get("taskId") or response.get("task_id") or response.get("id")
    if task_id:
        return str(task_id)
    raise ValueError("KIE image create response did not include a task id")


def _data(response: dict[str, Any]) -> dict[str, Any]:
    return response.get("data") if isinstance(response.get("data"), dict) else response


def _parse_result_json(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def extract_kie_image_url(response: dict[str, Any]) -> str | None:
    data = _data(response)
    result_json = _parse_result_json(data.get("resultJson"))
    if result_json:
        result_urls = result_json.get("resultUrls")
        if isinstance(result_urls, list) and result_urls:
            return str(result_urls[0])

    result_urls = data.get("resultUrls")
    if isinstance(result_urls, list) and result_urls:
        return str(result_urls[0])

    for key in ("imageUrl", "image_url", "output", "url"):
        value = data.get(key)
        if isinstance(value, str) and value:
            return value

    images = data.get("images")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict) and first.get("url"):
            return str(first["url"])

    return None


def extract_kie_image_error_message(response: dict[str, Any]) -> str:
    data = _data(response)
    for source in (data, response):
        for key in ("failMsg", "errorMessage", "error", "message", "msg"):
            value = source.get(key)
            if value:
                return str(value)
    return "Generation failed"
