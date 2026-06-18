from __future__ import annotations

from typing import Any


KIE_NANO_BANANA_PRO_MODEL = "nano-banana-pro"
KIE_NANO_BANANA_2_MODEL = "nano-banana-2"
KIE_GPT_IMAGE_2_T2I_MODEL = "gpt-image-2-text-to-image"
KIE_GPT_IMAGE_2_I2I_MODEL = "gpt-image-2-image-to-image"

GPT_IMAGE_2_ASPECT_RATIOS = [
    "auto",
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "5:4",
    "4:5",
    "16:9",
    "9:16",
    "2:1",
    "1:2",
    "3:1",
    "1:3",
    "21:9",
    "9:21",
]
GPT_IMAGE_2_RESOLUTIONS = ["1K", "2K", "4K"]
KIE_DEFERRED_IMAGE_MODELS: dict[str, str] = {}

KIE_IMAGE_MODEL_DEFAULTS: dict[str, dict[str, Any]] = {
    KIE_NANO_BANANA_PRO_MODEL: {
        "display_name": "Nano Banana Pro (KIE)",
        "family": "nano-banana",
        "task_types": ["text-to-image", "image-to-image"],
        "defaults": {"aspect_ratio": "1:1", "resolution": "1K"},
        "image_input_field": "image_input",
        "max_images": 8,
    },
    KIE_NANO_BANANA_2_MODEL: {
        "display_name": "Nano Banana 2 (KIE)",
        "family": "nano-banana",
        "task_types": ["text-to-image", "image-to-image"],
        "defaults": {"aspect_ratio": "auto", "resolution": "1K"},
        "image_input_field": "image_input",
        "max_images": 14,
    },
    KIE_GPT_IMAGE_2_T2I_MODEL: {
        "display_name": "GPT Image 2 (KIE)",
        "family": "gpt-image",
        "task_types": ["text-to-image"],
        "defaults": {"aspect_ratio": "auto", "resolution": "1K"},
        "image_input_field": None,
        "max_images": 0,
        "prompt_max_length": 20000,
        "aspect_ratio_options": GPT_IMAGE_2_ASPECT_RATIOS,
        "resolution_options": GPT_IMAGE_2_RESOLUTIONS,
    },
    KIE_GPT_IMAGE_2_I2I_MODEL: {
        "display_name": "GPT Image 2 I2I (KIE)",
        "family": "gpt-image",
        "task_types": ["image-to-image"],
        "defaults": {"aspect_ratio": "auto", "resolution": "1K"},
        "image_input_field": "input_urls",
        "max_images": 16,
        "prompt_max_length": 20000,
        "aspect_ratio_options": GPT_IMAGE_2_ASPECT_RATIOS,
        "resolution_options": GPT_IMAGE_2_RESOLUTIONS,
    },
}

KIE_IMAGE_SUPPORTED_MODELS = set(KIE_IMAGE_MODEL_DEFAULTS)
KIE_IMAGE_MODEL_ALIASES = {
    "Nano Banana Pro (KIE)": KIE_NANO_BANANA_PRO_MODEL,
    "Nano Banana 2 (KIE)": KIE_NANO_BANANA_2_MODEL,
    "GPT Image 2 (KIE)": KIE_GPT_IMAGE_2_T2I_MODEL,
    "GPT Image 2 I2I (KIE)": KIE_GPT_IMAGE_2_I2I_MODEL,
}


def normalize_kie_image_model(model: str | None) -> str:
    return KIE_IMAGE_MODEL_ALIASES.get(str(model or ""), str(model or ""))


def supports_kie_image_task(model: str, task_type: str) -> bool:
    return task_type in KIE_IMAGE_MODEL_DEFAULTS.get(normalize_kie_image_model(model), {}).get("task_types", [])


def default_kie_image_task_type(model: str, has_image_inputs: bool) -> str:
    model = normalize_kie_image_model(model)
    task_types = KIE_IMAGE_MODEL_DEFAULTS.get(model, {}).get("task_types", [])
    if len(task_types) == 1:
        return str(task_types[0])
    return "image-to-image" if has_image_inputs else "text-to-image"


def validate_gpt_image_2_params(
    *,
    model: str,
    task_type: str,
    prompt: str,
    image_urls: list[str] | None,
    aspect_ratio: str | None,
    resolution: str | None,
) -> None:
    if model not in {KIE_GPT_IMAGE_2_T2I_MODEL, KIE_GPT_IMAGE_2_I2I_MODEL}:
        return

    label = "GPT Image 2 (KIE)"
    if not (prompt or "").strip():
        raise ValueError(f"{label} prompt is required.")
    if len(prompt) > 20000:
        raise ValueError(f"{label} prompt must be 20000 characters or fewer.")
    if aspect_ratio not in GPT_IMAGE_2_ASPECT_RATIOS:
        raise ValueError(f"{label} aspect_ratio is not supported: {aspect_ratio}")
    if resolution not in GPT_IMAGE_2_RESOLUTIONS:
        raise ValueError(f"{label} resolution is not supported: {resolution}")

    urls = [url for url in (image_urls or []) if url]
    if task_type == "text-to-image" and urls:
        raise ValueError(f"{label} text-to-image does not accept input image URLs.")
    if task_type == "image-to-image":
        if not urls:
            raise ValueError(f"{label} image-to-image requires at least one input image URL.")
        if len(urls) > 16:
            raise ValueError(f"{label} image-to-image supports at most 16 input images.")
    if aspect_ratio == "auto" and resolution != "1K":
        raise ValueError(f"{label} auto aspect_ratio only supports 1K resolution.")
    if aspect_ratio == "1:1" and resolution == "4K":
        raise ValueError(f"{label} 1:1 aspect_ratio does not support 4K resolution.")


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

    validate_gpt_image_2_params(
        model=model,
        task_type=task_type,
        prompt=input_payload["prompt"],
        image_urls=image_urls,
        aspect_ratio=input_payload.get("aspect_ratio"),
        resolution=input_payload.get("resolution"),
    )

    if task_type == "image-to-image":
        urls = [url for url in (image_urls or []) if url]
        if not urls:
            raise ValueError("KIE image-to-image requires at least one image input")
        max_images = int(model_defaults.get("max_images") or 0)
        if max_images and len(urls) > max_images:
            raise ValueError(f"{model_defaults['display_name']} image-to-image supports at most {max_images} input images.")
        image_field = model_defaults.get("image_input_field") or "image_input"
        input_payload[image_field] = urls

    return {
        "model": model,
        "input": input_payload,
    }
