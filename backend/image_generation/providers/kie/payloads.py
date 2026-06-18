from __future__ import annotations

from typing import Any


KIE_NANO_BANANA_PRO_MODEL = "nano-banana-pro"
KIE_NANO_BANANA_2_MODEL = "nano-banana-2"

KIE_DEFERRED_IMAGE_MODELS = {
    "gpt-image-2": "requires exact KIE model id/documentation",
}

KIE_IMAGE_MODEL_DEFAULTS: dict[str, dict[str, Any]] = {
    KIE_NANO_BANANA_PRO_MODEL: {
        "display_name": "Nano Banana Pro (KIE)",
        "family": "nano-banana",
        "task_types": ["text-to-image", "image-to-image"],
        "defaults": {"aspect_ratio": "1:1", "resolution": "1K"},
        "image_input_field": "image_input",
    },
    KIE_NANO_BANANA_2_MODEL: {
        "display_name": "Nano Banana 2 (KIE)",
        "family": "nano-banana",
        "task_types": ["text-to-image", "image-to-image"],
        "defaults": {"aspect_ratio": "auto", "resolution": "1K"},
        "image_input_field": "image_input",
    },
}

KIE_IMAGE_SUPPORTED_MODELS = set(KIE_IMAGE_MODEL_DEFAULTS)
KIE_IMAGE_MODEL_ALIASES = {
    "Nano Banana Pro (KIE)": KIE_NANO_BANANA_PRO_MODEL,
    "Nano Banana 2 (KIE)": KIE_NANO_BANANA_2_MODEL,
}


def normalize_kie_image_model(model: str | None) -> str:
    return KIE_IMAGE_MODEL_ALIASES.get(str(model or ""), str(model or ""))


def supports_kie_image_task(model: str, task_type: str) -> bool:
    return task_type in KIE_IMAGE_MODEL_DEFAULTS.get(normalize_kie_image_model(model), {}).get("task_types", [])


def build_kie_image_create_payload(
    *,
    model: str,
    prompt: str,
    task_type: str,
    params: dict[str, Any] | None = None,
    image_urls: list[str] | None = None,
) -> dict[str, Any]:
    model = normalize_kie_image_model(model)
    if model not in KIE_IMAGE_SUPPORTED_MODELS:
        raise ValueError(f"Unsupported KIE image model: {model}")
    if not supports_kie_image_task(model, task_type):
        raise ValueError(f"KIE image model {model} does not support {task_type}")

    model_defaults = KIE_IMAGE_MODEL_DEFAULTS[model]
    values = dict(params or {})
    input_payload: dict[str, Any] = dict(model_defaults.get("defaults") or {})
    input_payload["prompt"] = prompt or ""

    aspect_ratio = values.get("aspect_ratio") or values.get("aspectRatio") or values.get("ratio")
    if aspect_ratio:
        input_payload["aspect_ratio"] = aspect_ratio
    if values.get("resolution"):
        input_payload["resolution"] = values.get("resolution")
    if values.get("output_format"):
        input_payload["output_format"] = values.get("output_format")
    if values.get("useGoogleSearch") is not None:
        input_payload["web_search"] = bool(values.get("useGoogleSearch"))
    if values.get("useImageSearch") is not None and model == KIE_NANO_BANANA_2_MODEL:
        input_payload["image_search"] = bool(values.get("useImageSearch"))

    if task_type == "image-to-image":
        urls = [url for url in (image_urls or []) if url]
        if not urls:
            raise ValueError("KIE image-to-image requires at least one image input")
        image_field = model_defaults.get("image_input_field") or "image_input"
        input_payload[image_field] = urls

    return {
        "model": model,
        "input": input_payload,
    }
