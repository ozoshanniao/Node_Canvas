from __future__ import annotations

from copy import deepcopy
from typing import Any

from video_generation.adapters.registry import legacy_adapter_id_for_provider
from video_generation.specs import VIDEO_GENERATION_REGISTRY


SCHEMA_VERSION = 1

STABLE_VIDEO_INPUT_HANDLES = (
    "text:prompt",
    "image:firstFrame",
    "image:lastFrame",
    "image:references",
    "video:references",
    "audio:references",
    "omniParams:in",
)
STABLE_VIDEO_OUTPUT_HANDLES = ("video:out",)
STABLE_VIDEO_HANDLES = set(STABLE_VIDEO_INPUT_HANDLES + STABLE_VIDEO_OUTPUT_HANDLES)

FRONTEND_CAPABILITY_FIELDS = {
    "schemaVersion",
    "provider",
    "model",
    "displayName",
    "family",
    "mediaType",
    "taskTypes",
    "inputCapabilities",
    "outputCapabilities",
    "parameters",
    "quickParams",
    "advancedParams",
    "uiHints",
    "featured",
    "experimental",
    "deprecated",
}
ADAPTER_ONLY_FIELDS = {"adapterHints", "hiddenParams"}
SENSITIVE_FIELD_TOKENS = ("apikey", "authorization", "bearer", "secret", "accesskey", "privatekey")
ALLOWED_PARAMETER_GROUPS = {"basic", "advanced", "hidden"}
BASIC_PARAMETER_KEYS = {
    "provider",
    "model",
    "taskType",
    "videoMode",
    "aspectRatio",
    "duration",
    "durationSeconds",
    "resolution",
    "generateAudio",
    "seed",
    "enableUpsample",
    "qualityMode",
}
ADVANCED_PARAMETER_KEYS = {
    "negativePrompt",
    "returnLastFrame",
    "watermark",
    "enhancePrompt",
    "enableUpsample",
    "numberOfVideos",
    "cameraControl",
    "cfgScale",
    "serviceTier",
}


def _handle_capability(
    handle_type: str,
    role: str,
    label: str,
    *,
    required: bool = False,
    supported: bool = False,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    capability = {
        "type": handle_type,
        "role": role,
        "label": label,
        "required": required,
        "supported": supported,
    }
    if metadata:
        capability["metadata"] = deepcopy(metadata)
    return capability


def _input_capabilities_for_model(model: dict[str, Any]) -> dict[str, dict[str, Any]]:
    legacy = model.get("inputCapabilities") or {}
    supported_modes = set(model.get("supportedModes") or [])
    is_omni = "omni-video" in supported_modes or bool((model.get("capabilities") or {}).get("omniComposer", {}).get("supported"))

    capabilities = {
        "text:prompt": _handle_capability(
            "text",
            "prompt",
            "Prompt",
            required="text-to-video" in supported_modes or "reference-video" in supported_modes or any(supported_modes),
            supported=bool(legacy.get("text")) and not is_omni,
        ),
        "image:firstFrame": _handle_capability(
            "image",
            "first_frame",
            "First Frame",
            supported=bool(legacy.get("images") or legacy.get("firstFrame")) and not is_omni,
            metadata={"maxItems": legacy.get("maxImages", 1)},
        ),
        "image:lastFrame": _handle_capability(
            "image",
            "last_frame",
            "Last Frame",
            supported=bool(legacy.get("endFrame") or legacy.get("lastFrame") or legacy.get("endFrameByQualityMode")),
        ),
        "image:references": _handle_capability(
            "image",
            "reference",
            "Image References",
            supported=bool(legacy.get("referenceImages")),
            metadata={"maxItems": legacy.get("maxReferenceImages", legacy.get("maxImages"))},
        ),
        "video:references": _handle_capability(
            "video",
            "reference",
            "Video References",
            supported=bool(legacy.get("videos") or legacy.get("referenceVideos")),
            metadata={"maxItems": legacy.get("maxVideos")},
        ),
        "audio:references": _handle_capability(
            "audio",
            "reference",
            "Audio References",
            supported=bool(legacy.get("audios") or legacy.get("referenceAudios")),
            metadata={"maxItems": legacy.get("maxAudios")},
        ),
        "omniParams:in": _handle_capability(
            "object",
            "omni_params",
            "Omni Params",
            required=is_omni,
            supported=is_omni,
        ),
    }
    return capabilities


def _output_capabilities_for_model() -> dict[str, dict[str, Any]]:
    return {
        "video:out": _handle_capability(
            "video",
            "generated_video",
            "Video Out",
            required=True,
            supported=True,
        )
    }


def _parameter_group(key: str, config: dict[str, Any], quick_params: set[str]) -> str:
    if key in ADVANCED_PARAMETER_KEYS:
        return "advanced"
    if key in quick_params or key in BASIC_PARAMETER_KEYS:
        return "basic"
    return str(config.get("group") or "advanced")


def _parameter_ui(config: dict[str, Any]) -> str:
    if config.get("control") == "slider":
        return "slider"
    if config.get("type") == "boolean":
        return "toggle"
    if config.get("type") == "number":
        return "number"
    return str(config.get("type") or "text")


def _canonical_parameters(model: dict[str, Any]) -> dict[str, dict[str, Any]]:
    quick_params = set(model.get("quickParams") or [])
    parameters: dict[str, dict[str, Any]] = {}
    for key, raw_config in (model.get("params") or {}).items():
        if not isinstance(raw_config, dict):
            continue
        group = _parameter_group(key, raw_config, quick_params)
        parameter = {
            "type": raw_config.get("type", "text"),
            "label": raw_config.get("label", key),
            "default": raw_config.get("default"),
            "group": group,
            "ui": _parameter_ui(raw_config),
        }
        for optional_key in ("options", "min", "max", "step", "customParamPath"):
            if optional_key in raw_config:
                parameter[optional_key] = deepcopy(raw_config[optional_key])
        parameters[key] = parameter
    parameters.update(_supplemental_parameters(model, parameters))
    return parameters


def _supplemental_parameters(model: dict[str, Any], parameters: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    model_id = str(model.get("id") or "")
    family = str(model.get("family") or "")
    adapter_key = str(model.get("adapterKey") or "")
    capabilities = model.get("capabilities") or {}
    supplemental: dict[str, dict[str, Any]] = {}

    def add(key: str, config: dict[str, Any]) -> None:
        if key not in parameters:
            supplemental[key] = config

    if family in {"veo", "kling"}:
        add("negativePrompt", {
            "type": "text",
            "label": "Negative Prompt",
            "default": "",
            "group": "advanced",
            "ui": "textarea",
        })

    if adapter_key.startswith("yunwu_veo"):
        add("enhancePrompt", {
            "type": "boolean",
            "label": "Enhance Prompt",
            "default": True,
            "group": "advanced",
            "ui": "toggle",
            "customParamPath": ["enhancePrompt"],
        })

    if family == "kling" and capabilities.get("cameraControl", {}).get("supported"):
        add("cameraControl", {
            "type": "object",
            "label": "Camera Control",
            "default": {"type": "none", "axis": "pan", "value": 0},
            "group": "advanced",
            "ui": "provider-specific",
            "customParamPath": ["kling", "cameraControl"],
        })

    if family == "kling":
        add("watermark", {
            "type": "boolean",
            "label": "Watermark",
            "default": False,
            "group": "hidden",
            "ui": "hidden",
        })

    if family == "seedance":
        add("watermark", {
            "type": "boolean",
            "label": "Watermark",
            "default": False,
            "group": "hidden",
            "ui": "hidden",
        })

    if model_id.startswith("veo-3.1"):
        add("serviceTier", {
            "type": "select",
            "label": "Service Tier",
            "options": ["standard"],
            "default": "standard",
            "group": "hidden",
            "ui": "hidden",
        })

    return supplemental


def _advanced_params(parameters: dict[str, dict[str, Any]], quick_params: list[str]) -> list[str]:
    quick_param_set = set(quick_params)
    return [
        key
        for key, config in parameters.items()
        if config.get("group") == "advanced" and key not in quick_param_set
    ]


def _model_feature_flags(provider_id: str, model: dict[str, Any]) -> tuple[bool, bool, bool]:
    model_id = str(model.get("id") or "")
    featured = provider_id in {"yunwu", "google", "seedance_official", "kling"} and not model_id.endswith("-lite-generate-001")
    return featured, False, False


def build_model_capability(provider: dict[str, Any], model: dict[str, Any]) -> dict[str, Any]:
    provider_id = str(provider.get("id") or "")
    model_id = str(model.get("id") or "")
    quick_params = list(model.get("quickParams") or [])
    parameters = _canonical_parameters(model)
    featured, experimental, deprecated = _model_feature_flags(provider_id, model)
    adapter_key = model.get("adapterKey", provider_id)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "provider": provider_id,
        "model": model_id,
        "displayName": model.get("label", model_id),
        "family": model.get("family", provider_id),
        "mediaType": "video",
        "taskTypes": list(model.get("supportedModes") or []),
        "inputCapabilities": _input_capabilities_for_model(model),
        "outputCapabilities": _output_capabilities_for_model(),
        "parameters": parameters,
        "quickParams": [key for key in quick_params if key in parameters],
        "advancedParams": _advanced_params(parameters, quick_params),
        "hiddenParams": {},
        "uiHints": {
            "legacyProviderLabel": provider.get("label", provider_id),
            "phase": "phase-1-schema-only",
        },
        "adapterHints": {
            "adapterId": legacy_adapter_id_for_provider(provider_id),
            "runtime": "adapter" if provider_id in {"yunwu", "google", "kling"} else "legacy",
            "adapterKey": adapter_key,
            "legacyModelId": model_id,
            "constraints": deepcopy(model.get("constraints") or {}),
        },
        "featured": featured,
        "experimental": experimental,
        "deprecated": deprecated,
    }


def list_video_model_capabilities(registry: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    source = registry or VIDEO_GENERATION_REGISTRY
    capabilities: list[dict[str, Any]] = []
    for provider in source.get("providers", []):
        for model in provider.get("models", []):
            capabilities.append(build_model_capability(provider, model))
    return capabilities


def _find_sensitive_paths(value: Any, path: str = "") -> list[str]:
    paths: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key)
            key_path = f"{path}.{key_text}" if path else key_text
            normalized = key_text.replace("_", "").replace("-", "").lower()
            if any(token in normalized for token in SENSITIVE_FIELD_TOKENS):
                paths.append(key_path)
            paths.extend(_find_sensitive_paths(child, key_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            paths.extend(_find_sensitive_paths(child, f"{path}[{index}]"))
    return paths


def validate_model_capability(capability: dict[str, Any]) -> None:
    errors: list[str] = []
    if capability.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("schemaVersion must be 1")
    for required_key in ("provider", "model", "displayName"):
        if not capability.get(required_key):
            errors.append(f"{required_key} is required")
    if capability.get("mediaType") != "video":
        errors.append("mediaType must be video")
    if not capability.get("taskTypes"):
        errors.append("taskTypes must be non-empty")
    if "video:out" not in (capability.get("outputCapabilities") or {}):
        errors.append("outputCapabilities must include video:out")

    for handle in (capability.get("inputCapabilities") or {}).keys():
        if handle not in STABLE_VIDEO_INPUT_HANDLES:
            errors.append(f"unsupported input handle: {handle}")

    for key, parameter in (capability.get("parameters") or {}).items():
        group = parameter.get("group")
        if group not in ALLOWED_PARAMETER_GROUPS:
            errors.append(f"parameter {key} has invalid group: {group}")

    parameters = capability.get("parameters") or {}
    for list_key in ("quickParams", "advancedParams"):
        for parameter_key in capability.get(list_key) or []:
            if parameter_key not in parameters:
                errors.append(f"{list_key} references missing parameter: {parameter_key}")

    sensitive_paths = _find_sensitive_paths(capability)
    if sensitive_paths:
        errors.append(f"sensitive fields are not allowed: {', '.join(sensitive_paths)}")

    if errors:
        raise ValueError("; ".join(errors))


def validate_video_model_capabilities(capabilities: list[dict[str, Any]] | None = None) -> None:
    for capability in capabilities or list_video_model_capabilities():
        validate_model_capability(capability)


def build_model_schema_snapshot(capability: dict[str, Any]) -> dict[str, Any]:
    parameter_summary = {}
    for key, parameter in (capability.get("parameters") or {}).items():
        summary = {
            "type": parameter.get("type"),
            "group": parameter.get("group"),
            "default": parameter.get("default"),
        }
        if "options" in parameter:
            summary["options"] = deepcopy(parameter["options"])
        parameter_summary[key] = summary

    return {
        "schemaVersion": capability.get("schemaVersion"),
        "provider": capability.get("provider"),
        "model": capability.get("model"),
        "displayName": capability.get("displayName"),
        "family": capability.get("family"),
        "mediaType": capability.get("mediaType"),
        "taskTypes": deepcopy(capability.get("taskTypes") or []),
        "inputCapabilities": deepcopy(capability.get("inputCapabilities") or {}),
        "outputCapabilities": deepcopy(capability.get("outputCapabilities") or {}),
        "parameterSummary": parameter_summary,
        "featured": bool(capability.get("featured")),
        "experimental": bool(capability.get("experimental")),
        "deprecated": bool(capability.get("deprecated")),
    }
