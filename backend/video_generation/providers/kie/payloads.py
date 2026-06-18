from __future__ import annotations

from typing import Any


KIE_WAN_T2V_MODEL = "wan/2-7-text-to-video"
KIE_WAN_I2V_MODEL = "wan/2-7-image-to-video"
KIE_KLING_30_T2V_MODEL = "kling-3.0/video/text-to-video"
KIE_KLING_30_I2V_MODEL = "kling-3.0/video/image-to-video"
KIE_KLING_26_T2V_MODEL = "kling-2.6/text-to-video"
KIE_KLING_26_I2V_MODEL = "kling-2.6/image-to-video"
KIE_SEEDANCE_2_T2V_MODEL = "bytedance/seedance-2/text-to-video"
KIE_SEEDANCE_2_I2V_MODEL = "bytedance/seedance-2/image-to-video"
KIE_SEEDANCE_2_FAST_T2V_MODEL = "bytedance/seedance-2-fast/text-to-video"
KIE_SEEDANCE_2_FAST_I2V_MODEL = "bytedance/seedance-2-fast/image-to-video"


KIE_MODEL_DEFAULTS: dict[str, dict[str, Any]] = {
    KIE_WAN_T2V_MODEL: {"task_type": "text-to-video", "family": "wan", "ratio_field": "ratio"},
    KIE_WAN_I2V_MODEL: {"task_type": "image-to-video", "family": "wan", "image_field": "first_frame_url"},
    KIE_KLING_30_T2V_MODEL: {"task_type": "text-to-video", "family": "kling", "ratio_field": "ratio"},
    KIE_KLING_30_I2V_MODEL: {"task_type": "image-to-video", "family": "kling", "image_field": "first_frame_url"},
    KIE_KLING_26_T2V_MODEL: {"task_type": "text-to-video", "family": "kling", "ratio_field": "ratio"},
    KIE_KLING_26_I2V_MODEL: {"task_type": "image-to-video", "family": "kling", "image_field": "first_frame_url"},
    KIE_SEEDANCE_2_T2V_MODEL: {"task_type": "text-to-video", "family": "seedance", "ratio_field": "ratio"},
    KIE_SEEDANCE_2_I2V_MODEL: {"task_type": "image-to-video", "family": "seedance", "image_field": "first_frame_url"},
    KIE_SEEDANCE_2_FAST_T2V_MODEL: {"task_type": "text-to-video", "family": "seedance", "ratio_field": "ratio"},
    KIE_SEEDANCE_2_FAST_I2V_MODEL: {"task_type": "image-to-video", "family": "seedance", "image_field": "first_frame_url"},
}
KIE_SUPPORTED_MODELS = set(KIE_MODEL_DEFAULTS)


def is_kie_i2v_model(model: str) -> bool:
    return KIE_MODEL_DEFAULTS.get(model, {}).get("task_type") == "image-to-video"


def is_kie_t2v_model(model: str) -> bool:
    return KIE_MODEL_DEFAULTS.get(model, {}).get("task_type") == "text-to-video"


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

    model_defaults = KIE_MODEL_DEFAULTS[model]
    values = dict(params or {})
    input_payload: dict[str, Any] = {
        "prompt": prompt or "",
        "duration": _duration_value(values),
        "resolution": values.get("resolution") or "720p",
    }

    if is_kie_t2v_model(model):
        ratio_field = model_defaults.get("ratio_field") or "ratio"
        input_payload[ratio_field] = values.get("aspectRatio") or values.get("ratio") or "16:9"
    elif is_kie_i2v_model(model):
        if not first_frame_url:
            raise ValueError("KIE image-to-video requires image:firstFrame")
        # KIE Kling and Seedance image field names still need real smoke validation.
        # Keep this centralized so a future correction does not touch adapter routing.
        image_field = model_defaults.get("image_field") or "first_frame_url"
        input_payload[image_field] = first_frame_url

    if values.get("seed") not in (None, "", -1):
        input_payload["seed"] = values.get("seed")
    if values.get("negativePrompt"):
        input_payload["negative_prompt"] = values.get("negativePrompt")

    return {
        "model": model,
        "input": input_payload,
    }
