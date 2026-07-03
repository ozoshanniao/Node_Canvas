# backend/engines/specs.py

CAPABILITY_PROFILES = {
    "pro_image_spec": {
        "ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search"],
        "supports_reference": True,
    },
    "flash_image_spec": {
        "ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search"],
        "supports_reference": True,
    },
    "google_studio_nano_banana_pro_spec": {
        "id": "gemini-3-pro-image",
        "label": "Nano Banana Pro",
        "provider": "google_studio",
        "mediaType": "image",
        "family": "nano-banana",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "supports_reference": True,
        "maxImages": 14,
        "featured": True,
        "experimental": False,
    },
    "google_studio_nano_banana_2_spec": {
        "id": "gemini-3.1-flash-image",
        "label": "Nano Banana 2",
        "provider": "google_studio",
        "mediaType": "image",
        "family": "nano-banana",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"],
        "resolutions": ["0.5K", "1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "supports_reference": True,
        "maxImages": 14,
        "featured": True,
        "experimental": False,
    },
    "kie_nano_banana_pro_spec": {
        "id": "nano-banana-pro",
        "label": "Nano Banana Pro (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "nano-banana",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search"],
        "supports_reference": True,
        "internalImageInputField": "image_input",
        "maxImages": 8,
        "promptMaxLength": 10000,
        "featured": True,
        "experimental": False,
    },
    "kie_nano_banana_2_spec": {
        "id": "nano-banana-2",
        "label": "Nano Banana 2 (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "nano-banana",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["auto", "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search", "image_search"],
        "supports_reference": True,
        "internalImageInputField": "image_input",
        "maxImages": 14,
        "promptMaxLength": 20000,
        "featured": True,
        "experimental": False,
    },
    "kie_gpt_image_2_spec": {
        "id": "gpt-image-2",
        "label": "GPT Image 2 (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "gpt-image",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "supports_reference": True,
        "featured": True,
        "experimental": False,
        "internalImageInputField": "input_urls",
        "maxImages": 16,
        "promptMaxLength": 20000,
        "constraints": {
            "autoAspectRatioResolution": "1K",
            "squareAspectRatioDisallows": ["4K"],
        },
    },
    "gpt_image_spec": {
        "ratios": ["auto", "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg", "webp"],
        "quality": ["auto", "low", "medium", "high"],
        "n": {
            "type": "slider",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 1,
            "label": "Batch Size",
        },
        "supports_reference": True,
    },
}

MODEL_NAME_MAP = {
    "Nano pro": "pro_image_spec",
    "Nano Pro": "pro_image_spec",
    "Nano Banana Pro": "pro_image_spec",
    "Nano 2": "flash_image_spec",
    "Nano Banana 2": "flash_image_spec",
    "gemini-3-pro-image": "google_studio_nano_banana_pro_spec",
    "gemini-3.1-flash-image": "google_studio_nano_banana_2_spec",
    "GPT-2": "gpt_image_spec",
    "Nano Banana Pro (KIE)": "kie_nano_banana_pro_spec",
    "Nano Banana 2 (KIE)": "kie_nano_banana_2_spec",
    "GPT Image 2 (KIE)": "kie_gpt_image_2_spec",
    "GPT Image 2 I2I (KIE)": "kie_gpt_image_2_spec",
}

PROVIDER_MODEL_NAME_MAP = {
    "Google": {
        "Nano pro": "pro_image_spec",
        "Nano Pro": "pro_image_spec",
        "Nano Banana Pro": "pro_image_spec",
        "gemini-3-pro-image": "pro_image_spec",
        "Nano 2": "flash_image_spec",
        "Nano Banana 2": "flash_image_spec",
        "gemini-3.1-flash-image": "flash_image_spec",
    },
    "google_studio": {
        "gemini-3-pro-image": "google_studio_nano_banana_pro_spec",
        "gemini-3.1-flash-image": "google_studio_nano_banana_2_spec",
    },
}

PROVIDER_MODELS = {
    "Google": ["Nano Pro", "Nano 2"],
    "google_studio": ["gemini-3-pro-image", "gemini-3.1-flash-image"],
    "Yunwu": ["Nano pro", "Nano 2", "GPT-2"],
    "KIE": ["Nano Banana Pro (KIE)", "Nano Banana 2 (KIE)", "GPT Image 2 (KIE)"],
}


def get_model_spec(provider, model):
    provider_map = PROVIDER_MODEL_NAME_MAP.get(provider)
    if provider_map is None and isinstance(provider, str):
        provider_map = PROVIDER_MODEL_NAME_MAP.get(provider.capitalize())
    profile_id = (provider_map or {}).get(model) or MODEL_NAME_MAP.get(model)
    return CAPABILITY_PROFILES.get(profile_id)


def get_frontend_specs():
    full_specs = {
        ui_name: CAPABILITY_PROFILES.get(profile_id)
        for ui_name, profile_id in MODEL_NAME_MAP.items()
    }
    for provider, model_names in PROVIDER_MODELS.items():
        for ui_name in model_names:
            full_specs[ui_name] = get_model_spec(provider, ui_name)

    return {
        "models": full_specs,
        "providers": PROVIDER_MODELS,
    }
