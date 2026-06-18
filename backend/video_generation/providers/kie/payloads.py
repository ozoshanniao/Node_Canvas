from __future__ import annotations

from typing import Any


KIE_WAN_T2V_MODEL = "wan/2-7-text-to-video"
KIE_WAN_I2V_MODEL = "wan/2-7-image-to-video"
KIE_SUPPORTED_MODELS = {KIE_WAN_T2V_MODEL, KIE_WAN_I2V_MODEL}


def _duration_value(params: dict[str, Any]) -> int:
    value = params.get("durationSeconds") or params.get("duration") or 5
    if isinstance(value, str):
        value = value.strip().lower().removesuffix("s")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 5


def build_kie_create_payload(
    *,
    model: str,
    prompt: str,
    task_type: str,
    params: dict[str, Any] | None = None,
    first_frame_url: str | None = None,
) -> dict[str, Any]:
    if model not in KIE_SUPPORTED_MODELS:
        raise ValueError(f"Unsupported KIE model: {model}")

    values = dict(params or {})
    input_payload: dict[str, Any] = {
        "prompt": prompt or "",
        "duration": _duration_value(values),
        "resolution": values.get("resolution") or "720p",
    }

    if model == KIE_WAN_T2V_MODEL:
        input_payload["ratio"] = values.get("aspectRatio") or values.get("ratio") or "16:9"
    elif model == KIE_WAN_I2V_MODEL:
        if not first_frame_url:
            raise ValueError("KIE image-to-video requires image:firstFrame")
        input_payload["first_frame_url"] = first_frame_url

    if values.get("seed") not in (None, "", -1):
        input_payload["seed"] = values.get("seed")
    if values.get("negativePrompt"):
        input_payload["negative_prompt"] = values.get("negativePrompt")

    return {
        "model": model,
        "input": input_payload,
    }
