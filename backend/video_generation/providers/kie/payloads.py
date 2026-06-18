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
KIE_KLING_30_API_MODEL = "kling-3.0/video"
KIE_SEEDANCE_2_API_MODEL = "bytedance/seedance-2"
KIE_SEEDANCE_2_FAST_API_MODEL = "bytedance/seedance-2-fast"


KIE_MODEL_DEFAULTS: dict[str, dict[str, Any]] = {
    KIE_WAN_T2V_MODEL: {"task_type": "text-to-video", "family": "wan", "ratio_field": "ratio"},
    KIE_WAN_I2V_MODEL: {
        "task_type": "image-to-video",
        "family": "wan",
        "image_field": "first_frame_url",
        "last_image_field": "last_frame_url",
    },
    KIE_KLING_30_T2V_MODEL: {
        "api_model": KIE_KLING_30_API_MODEL,
        "task_type": "text-to-video",
        "family": "kling",
        "ratio_field": "aspect_ratio",
        "mode": "pro",
        "sound": True,
    },
    KIE_KLING_30_I2V_MODEL: {
        "api_model": KIE_KLING_30_API_MODEL,
        "task_type": "image-to-video",
        "family": "kling",
        "ratio_field": "aspect_ratio",
        "image_field": "image_urls",
        "image_field_type": "list",
        "mode": "pro",
        "sound": True,
    },
    KIE_KLING_26_T2V_MODEL: {
        "task_type": "text-to-video",
        "family": "kling",
        "ratio_field": "aspect_ratio",
        "sound": True,
    },
    KIE_KLING_26_I2V_MODEL: {
        "task_type": "image-to-video",
        "family": "kling",
        "ratio_field": "aspect_ratio",
        "image_field": "image_urls",
        "image_field_type": "list",
        "sound": True,
    },
    KIE_SEEDANCE_2_T2V_MODEL: {
        "api_model": KIE_SEEDANCE_2_API_MODEL,
        "task_type": "text-to-video",
        "family": "seedance",
        "ratio_field": "aspect_ratio",
    },
    KIE_SEEDANCE_2_I2V_MODEL: {
        "api_model": KIE_SEEDANCE_2_API_MODEL,
        "task_type": "image-to-video",
        "family": "seedance",
        "ratio_field": "aspect_ratio",
        "image_field": "first_frame_url",
        "last_image_field": "last_frame_url",
    },
    KIE_SEEDANCE_2_FAST_T2V_MODEL: {
        "api_model": KIE_SEEDANCE_2_FAST_API_MODEL,
        "task_type": "text-to-video",
        "family": "seedance",
        "ratio_field": "aspect_ratio",
    },
    KIE_SEEDANCE_2_FAST_I2V_MODEL: {
        "api_model": KIE_SEEDANCE_2_FAST_API_MODEL,
        "task_type": "image-to-video",
        "family": "seedance",
        "ratio_field": "aspect_ratio",
        "image_field": "first_frame_url",
        "last_image_field": "last_frame_url",
    },
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


def _first_present(params: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value = params.get(key)
        if value not in (None, ""):
            return value
    return default


def _apply_documented_optional_fields(input_payload: dict[str, Any], params: dict[str, Any], defaults: dict[str, Any]) -> None:
    if defaults.get("mode") is not None:
        input_payload["mode"] = _first_present(params, "mode", default=defaults["mode"])
    if defaults.get("sound") is not None:
        input_payload["sound"] = bool(_first_present(params, "sound", "generateAudio", "generate_audio", default=defaults["sound"]))
    if defaults.get("family") == "seedance":
        generate_audio = _first_present(params, "generateAudio", "generate_audio")
        if generate_audio is not None:
            input_payload["generate_audio"] = bool(generate_audio)
        return_last_frame = _first_present(params, "returnLastFrame", "return_last_frame")
        if return_last_frame is not None:
            input_payload["return_last_frame"] = bool(return_last_frame)


def build_kie_create_payload(
    *,
    model: str,
    prompt: str,
    task_type: str,
    params: dict[str, Any] | None = None,
    first_frame_url: str | None = None,
    last_frame_url: str | None = None,
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

    ratio_field = model_defaults.get("ratio_field")
    if ratio_field:
        input_payload[ratio_field] = values.get("aspectRatio") or values.get("aspect_ratio") or values.get("ratio") or "16:9"

    if is_kie_t2v_model(model):
        pass
    elif is_kie_i2v_model(model):
        if not first_frame_url:
            raise ValueError("KIE image-to-video requires image:firstFrame")
        image_field = model_defaults.get("image_field") or "first_frame_url"
        if model_defaults.get("image_field_type") == "list":
            image_urls = [first_frame_url]
            if last_frame_url:
                image_urls.append(last_frame_url)
            input_payload[image_field] = image_urls
        else:
            input_payload[image_field] = first_frame_url
            last_image_field = model_defaults.get("last_image_field")
            if last_image_field and last_frame_url:
                input_payload[last_image_field] = last_frame_url

    _apply_documented_optional_fields(input_payload, values, model_defaults)

    if values.get("seed") not in (None, "", -1):
        input_payload["seed"] = values.get("seed")
    if values.get("negativePrompt"):
        input_payload["negative_prompt"] = values.get("negativePrompt")

    return {
        "model": model_defaults.get("api_model") or model,
        "input": input_payload,
    }
