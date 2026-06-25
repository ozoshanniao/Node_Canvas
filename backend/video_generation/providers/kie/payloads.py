from __future__ import annotations

from typing import Any


KIE_WAN_T2V_MODEL = "wan/2-7-text-to-video"
KIE_WAN_I2V_MODEL = "wan/2-7-image-to-video"
KIE_WAN_MODEL = "wan/2-7"
KIE_KLING_30_T2V_MODEL = "kling-3.0/video/text-to-video"
KIE_KLING_30_I2V_MODEL = "kling-3.0/video/image-to-video"
KIE_KLING_30_MODEL = "kling-3.0/video"
KIE_KLING_26_T2V_MODEL = "kling-2.6/text-to-video"
KIE_KLING_26_I2V_MODEL = "kling-2.6/image-to-video"
KIE_KLING_26_MODEL = "kling-2.6"
KIE_SEEDANCE_2_T2V_MODEL = "bytedance/seedance-2/text-to-video"
KIE_SEEDANCE_2_I2V_MODEL = "bytedance/seedance-2/image-to-video"
KIE_SEEDANCE_2_FAST_T2V_MODEL = "bytedance/seedance-2-fast/text-to-video"
KIE_SEEDANCE_2_FAST_I2V_MODEL = "bytedance/seedance-2-fast/image-to-video"
KIE_SEEDANCE_2_MODEL = "bytedance/seedance-2"
KIE_SEEDANCE_2_FAST_MODEL = "bytedance/seedance-2-fast"
KIE_KLING_30_API_MODEL = "kling-3.0/video"
KIE_SEEDANCE_2_API_MODEL = "bytedance/seedance-2"
KIE_SEEDANCE_2_FAST_API_MODEL = "bytedance/seedance-2-fast"

KIE_LEGACY_MODEL_ALIASES = {
    KIE_WAN_T2V_MODEL: {"model": KIE_WAN_MODEL, "task_type": "text-to-video"},
    KIE_WAN_I2V_MODEL: {"model": KIE_WAN_MODEL, "task_type": "image-to-video"},
    KIE_KLING_26_T2V_MODEL: {"model": KIE_KLING_26_MODEL, "task_type": "text-to-video"},
    KIE_KLING_26_I2V_MODEL: {"model": KIE_KLING_26_MODEL, "task_type": "image-to-video"},
    KIE_KLING_30_T2V_MODEL: {"model": KIE_KLING_30_MODEL, "task_type": "text-to-video"},
    KIE_KLING_30_I2V_MODEL: {"model": KIE_KLING_30_MODEL, "task_type": "image-to-video"},
    KIE_SEEDANCE_2_T2V_MODEL: {"model": KIE_SEEDANCE_2_MODEL, "task_type": "text-to-video"},
    KIE_SEEDANCE_2_I2V_MODEL: {"model": KIE_SEEDANCE_2_MODEL, "task_type": "image-to-video"},
    KIE_SEEDANCE_2_FAST_T2V_MODEL: {"model": KIE_SEEDANCE_2_FAST_MODEL, "task_type": "text-to-video"},
    KIE_SEEDANCE_2_FAST_I2V_MODEL: {"model": KIE_SEEDANCE_2_FAST_MODEL, "task_type": "image-to-video"},
}


KIE_MODEL_DEFAULTS: dict[str, dict[str, Any]] = {
    KIE_WAN_MODEL: {
        "api_models": {
            "text-to-video": KIE_WAN_T2V_MODEL,
            "image-to-video": KIE_WAN_I2V_MODEL,
        },
        "task_types": {"text-to-video", "image-to-video"},
        "family": "wan",
        "ratio_field_by_task": {"text-to-video": "ratio"},
        "image_field": "first_frame_url",
        "last_image_field": "last_frame_url",
    },
    KIE_KLING_30_MODEL: {
        "api_model": KIE_KLING_30_API_MODEL,
        "task_types": {"text-to-video", "image-to-video"},
        "family": "kling",
        "ratio_field": "aspect_ratio",
        "image_field": "image_urls",
        "image_field_type": "list",
        "mode": "pro",
        "sound": True,
    },
    KIE_KLING_26_MODEL: {
        "api_models": {
            "text-to-video": KIE_KLING_26_T2V_MODEL,
            "image-to-video": KIE_KLING_26_I2V_MODEL,
        },
        "task_types": {"text-to-video", "image-to-video"},
        "family": "kling",
        "ratio_field": "aspect_ratio",
        "image_field": "image_urls",
        "image_field_type": "list",
        "sound": True,
    },
    KIE_SEEDANCE_2_MODEL: {
        "api_model": KIE_SEEDANCE_2_API_MODEL,
        "task_types": {"text-to-video", "image-to-video", "reference-video"},
        "family": "seedance",
        "ratio_field": "aspect_ratio",
        "image_field": "first_frame_url",
        "last_image_field": "last_frame_url",
    },
    KIE_SEEDANCE_2_FAST_MODEL: {
        "api_model": KIE_SEEDANCE_2_FAST_API_MODEL,
        "task_types": {"text-to-video", "image-to-video", "reference-video"},
        "family": "seedance",
        "ratio_field": "aspect_ratio",
        "image_field": "first_frame_url",
        "last_image_field": "last_frame_url",
    },
}
KIE_SUPPORTED_MODELS = set(KIE_MODEL_DEFAULTS)


def normalize_kie_video_model(model: str) -> str:
    return KIE_LEGACY_MODEL_ALIASES.get(model, {}).get("model", model)


def _legacy_task_type(model: str) -> str | None:
    return KIE_LEGACY_MODEL_ALIASES.get(model, {}).get("task_type")


def _mode_to_task_type(mode: Any) -> str | None:
    normalized = str(mode or "").strip().lower()
    if normalized in {"image-to-video", "frame", "i2v"}:
        return "image-to-video"
    if normalized in {"reference-video", "multimodal-reference", "reference", "ref"}:
        return "reference-video"
    if normalized in {"text-to-video", "text", "t2v"}:
        return "text-to-video"
    return None


def resolve_kie_task_type(model: str, task_type: str | None = None, params: dict[str, Any] | None = None) -> str:
    legacy = _legacy_task_type(model)
    if legacy:
        return legacy
    params = params or {}
    return (
        _mode_to_task_type(task_type)
        or _mode_to_task_type(params.get("videoMode"))
        or _mode_to_task_type(params.get("taskType"))
        or "text-to-video"
    )


def is_kie_i2v_model(model: str, task_type: str | None = None, params: dict[str, Any] | None = None) -> bool:
    return resolve_kie_task_type(model, task_type, params) == "image-to-video"


def is_kie_reference_model(model: str, task_type: str | None = None, params: dict[str, Any] | None = None) -> bool:
    return resolve_kie_task_type(model, task_type, params) == "reference-video"


def is_kie_t2v_model(model: str, task_type: str | None = None, params: dict[str, Any] | None = None) -> bool:
    return resolve_kie_task_type(model, task_type, params) == "text-to-video"


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
        input_payload["mode"] = _first_present(params, "qualityMode", "mode", default=defaults["mode"])
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
    reference_image_urls: list[str] | None = None,
    reference_video_urls: list[str] | None = None,
    reference_audio_urls: list[str] | None = None,
) -> dict[str, Any]:
    resolved_model = normalize_kie_video_model(model)
    if resolved_model not in KIE_SUPPORTED_MODELS:
        raise ValueError(f"Unsupported KIE model: {model}")

    values = dict(params or {})
    model_defaults = KIE_MODEL_DEFAULTS[resolved_model]
    resolved_task_type = resolve_kie_task_type(model, task_type, values)
    input_payload: dict[str, Any] = {
        "prompt": prompt or "",
        "duration": _duration_value(values),
        "resolution": values.get("resolution") or "720p",
    }

    ratio_field = model_defaults.get("ratio_field_by_task", {}).get(resolved_task_type) or model_defaults.get("ratio_field")
    if ratio_field:
        input_payload[ratio_field] = values.get("aspectRatio") or values.get("aspect_ratio") or values.get("ratio") or "16:9"

    if resolved_task_type == "text-to-video":
        pass
    elif resolved_task_type == "image-to-video":
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
    elif resolved_task_type == "reference-video":
        if reference_image_urls:
            input_payload["reference_image_urls"] = reference_image_urls
        if reference_video_urls:
            input_payload["reference_video_urls"] = reference_video_urls
        if reference_audio_urls:
            input_payload["reference_audio_urls"] = reference_audio_urls

    _apply_documented_optional_fields(input_payload, values, model_defaults)

    if values.get("seed") not in (None, "", -1):
        input_payload["seed"] = values.get("seed")
    if values.get("negativePrompt"):
        input_payload["negative_prompt"] = values.get("negativePrompt")

    api_model = model_defaults.get("api_models", {}).get(resolved_task_type) or model_defaults.get("api_model") or model
    return {
        "model": api_model,
        "input": input_payload,
    }
