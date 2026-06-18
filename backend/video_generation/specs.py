from copy import deepcopy


COMMON_SEED_PARAM = {
    "type": "number",
    "label": "Seed",
    "min": -1,
    "max": 99999999,
    "default": -1,
}

def kie_video_mode_param(mode: str):
    return {
        "type": "select",
        "label": "Video Mode",
        "options": [mode],
        "default": mode,
    }


KIE_WAN_DURATION_OPTIONS = [f"{value}s" for value in range(2, 16)]
KIE_KLING_30_DURATION_OPTIONS = [f"{value}s" for value in range(3, 16)]
KIE_SEEDANCE_DURATION_OPTIONS = [f"{value}s" for value in range(4, 16)]
KIE_WAN_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "4:3", "3:4"]
KIE_SEEDANCE_RATIO_OPTIONS = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"]


def kie_wan_params(mode: str):
    params = {
        "videoMode": kie_video_mode_param(mode),
        "duration": {
            "type": "select",
            "label": "Duration",
            "options": KIE_WAN_DURATION_OPTIONS,
            "default": "5s",
        },
        "durationSeconds": {
            "type": "number",
            "label": "Duration Seconds",
            "min": 2,
            "max": 15,
            "default": 5,
        },
        "resolution": {
            "type": "select",
            "label": "Resolution",
            "options": ["720p", "1080p"],
            "default": "720p",
        },
        "negativePrompt": {
            "type": "text",
            "label": "Negative Prompt",
            "default": "",
        },
        "seed": COMMON_SEED_PARAM,
    }
    if mode == "text-to-video":
        params["aspectRatio"] = {
            "type": "select",
            "label": "Aspect Ratio",
            "options": KIE_WAN_RATIO_OPTIONS,
            "default": "16:9",
        }
    return params


def kie_kling_26_params(mode: str):
    return {
        "videoMode": kie_video_mode_param(mode),
        "aspectRatio": {
            "type": "select",
            "label": "Aspect Ratio",
            "options": ["1:1", "16:9", "9:16"],
            "default": "16:9",
        },
        "duration": {
            "type": "select",
            "label": "Duration",
            "options": ["5s", "10s"],
            "default": "5s",
        },
        "generateAudio": {
            "type": "boolean",
            "label": "Sound",
            "default": True,
        },
    }


def kie_kling_30_params(mode: str):
    return {
        "videoMode": kie_video_mode_param(mode),
        "aspectRatio": {
            "type": "select",
            "label": "Aspect Ratio",
            "options": ["16:9", "9:16", "1:1"],
            "default": "16:9",
        },
        "duration": {
            "type": "select",
            "label": "Duration",
            "options": KIE_KLING_30_DURATION_OPTIONS,
            "default": "5s",
        },
        "qualityMode": {
            "type": "select",
            "label": "Quality",
            "options": ["std", "pro", "4K"],
            "default": "pro",
        },
        "generateAudio": {
            "type": "boolean",
            "label": "Sound",
            "default": True,
        },
    }


def kie_seedance_params(mode: str, resolution_options):
    return {
        "videoMode": kie_video_mode_param(mode),
        "aspectRatio": {
            "type": "select",
            "label": "Aspect Ratio",
            "options": KIE_SEEDANCE_RATIO_OPTIONS,
            "default": "adaptive",
        },
        "duration": {
            "type": "select",
            "label": "Duration",
            "options": KIE_SEEDANCE_DURATION_OPTIONS,
            "default": "5s",
        },
        "durationSeconds": {
            "type": "number",
            "label": "Duration Seconds",
            "min": 4,
            "max": 15,
            "default": 5,
        },
        "resolution": {
            "type": "select",
            "label": "Resolution",
            "options": resolution_options,
            "default": "720p",
        },
        "generateAudio": {
            "type": "boolean",
            "label": "Generate Audio",
            "default": False,
        },
        "returnLastFrame": {
            "type": "boolean",
            "label": "Return Last Frame",
            "default": False,
            "deprecated": True,
        },
        "seed": COMMON_SEED_PARAM,
    }


KIE_PARAMS_BY_MODEL = {
    "wan/2-7-text-to-video": kie_wan_params("text-to-video"),
    "wan/2-7-image-to-video": kie_wan_params("image-to-video"),
    "kling-3.0/video/text-to-video": kie_kling_30_params("text-to-video"),
    "kling-3.0/video/image-to-video": kie_kling_30_params("image-to-video"),
    "kling-2.6/text-to-video": kie_kling_26_params("text-to-video"),
    "kling-2.6/image-to-video": kie_kling_26_params("image-to-video"),
    "bytedance/seedance-2/text-to-video": kie_seedance_params("text-to-video", ["480p", "720p", "1080p"]),
    "bytedance/seedance-2/image-to-video": kie_seedance_params("image-to-video", ["480p", "720p", "1080p"]),
    "bytedance/seedance-2-fast/text-to-video": kie_seedance_params("text-to-video", ["480p", "720p"]),
    "bytedance/seedance-2-fast/image-to-video": kie_seedance_params("image-to-video", ["480p", "720p"]),
}

KIE_VIDEO_MODEL_WHITELIST = [
    ("wan/2-7-text-to-video", "Wan 2.7 (KIE)", "wan", "text-to-video"),
    ("wan/2-7-image-to-video", "Wan 2.7 I2V (KIE)", "wan", "image-to-video"),
    ("kling-3.0/video/text-to-video", "Kling 3.0 (KIE)", "kling", "text-to-video"),
    ("kling-3.0/video/image-to-video", "Kling 3.0 I2V (KIE)", "kling", "image-to-video"),
    ("kling-2.6/text-to-video", "Kling 2.6 (KIE)", "kling", "text-to-video"),
    ("kling-2.6/image-to-video", "Kling 2.6 I2V (KIE)", "kling", "image-to-video"),
    ("bytedance/seedance-2/text-to-video", "Seedance 2.0 (KIE)", "seedance", "text-to-video"),
    ("bytedance/seedance-2/image-to-video", "Seedance 2.0 I2V (KIE)", "seedance", "image-to-video"),
    ("bytedance/seedance-2-fast/text-to-video", "Seedance 2.0 Fast (KIE)", "seedance", "text-to-video"),
    ("bytedance/seedance-2-fast/image-to-video", "Seedance 2.0 Fast I2V (KIE)", "seedance", "image-to-video"),
]


def kie_video_model(model_id: str, label: str, family: str, mode: str):
    is_i2v = mode == "image-to-video"
    params = deepcopy(KIE_PARAMS_BY_MODEL[model_id])
    quick_params = ["videoMode", "duration"]
    if "aspectRatio" in params:
        quick_params.insert(1, "aspectRatio")
    if "qualityMode" in params:
        quick_params.append("qualityMode")
    if "resolution" in params:
        quick_params.append("resolution")
    return {
        "id": model_id,
        "label": label,
        "family": family,
        "adapterKey": "kie_wan",
        "supportedModes": [mode],
        "inputCapabilities": {
            "text": True,
            "promptRequired": not is_i2v,
            "images": is_i2v,
            "firstFrame": is_i2v,
            "firstFrameRequired": is_i2v,
            "endFrame": False,
            "referenceImages": False,
            "maxImages": 1 if is_i2v else 0,
            **({"maxInputImageSizeMb": 10} if is_i2v else {}),
        },
        "quickParams": quick_params,
        "params": params,
        "customParams": {},
    }


SEEDANCE_MODES = ["frame", "multimodal-reference"]
SEEDANCE_RATIO_OPTIONS = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]
SEEDANCE_DURATION_OPTIONS = [f"{value}s" for value in range(4, 16)]

YUNWU_VEO_PARAMS = {
    "videoMode": {
        "type": "select",
        "label": "Video Mode",
        "options": ["text-to-video", "image-to-video"],
        "default": "text-to-video",
    },
    "aspectRatio": {
        "type": "select",
        "label": "Aspect Ratio",
        "options": ["16:9", "9:16"],
        "default": "16:9",
    },
    "enableUpsample": {
        "type": "boolean",
        "label": "Upsample",
        "default": False,
    },
    "seed": COMMON_SEED_PARAM,
}

KLING_STANDARD_DURATION_OPTIONS = ["5s", "10s"]
KLING_EXTENDED_DURATION_OPTIONS = [
    "3s",
    "4s",
    "5s",
    "6s",
    "7s",
    "8s",
    "9s",
    "10s",
    "11s",
    "12s",
    "13s",
    "14s",
    "15s",
]


def kling_params(video_modes, duration_options):
    return {
        "videoMode": {
            "type": "select",
            "label": "Video Mode",
            "options": video_modes,
            "default": video_modes[0],
        },
        "aspectRatio": {
            "type": "select",
            "label": "Aspect Ratio",
            "options": ["16:9", "9:16", "1:1"],
            "default": "16:9",
        },
        "duration": {
            "type": "select",
            "label": "Duration",
            "options": duration_options,
            "default": "5s",
        },
        "qualityMode": {
            "type": "select",
            "label": "Quality",
            "options": ["std", "pro"],
            "default": "std",
        },
        "generateAudio": {
            "type": "boolean",
            "label": "Sound",
            "default": False,
        },
    }


KLING_V3_PARAMS = {
    **kling_params(["text-to-video", "image-to-video"], KLING_EXTENDED_DURATION_OPTIONS),
    "shotMode": {
        "type": "select",
        "label": "Shot Mode",
        "options": ["single", "intelligence", "customize"],
        "default": "single",
        "customParamPath": ["kling", "shotMode"],
    },
    "cfgScale": {
        "type": "number",
        "label": "CFG Scale",
        "min": 0,
        "max": 1,
        "step": 0.05,
        "default": 0.5,
        "customParamPath": ["kling", "cfgScale"],
        "control": "slider",
    },
}


def seedance_params(resolution_options):
    return {
        "videoMode": {
            "type": "select",
            "label": "Video Mode",
            "options": SEEDANCE_MODES,
            "default": "frame",
        },
        "aspectRatio": {
            "type": "select",
            "label": "Ratio",
            "options": SEEDANCE_RATIO_OPTIONS,
            "default": "adaptive",
        },
        "duration": {
            "type": "select",
            "label": "Duration",
            "options": SEEDANCE_DURATION_OPTIONS,
            "default": "5s",
        },
        "durationSeconds": {
            "type": "number",
            "label": "Duration Seconds",
            "min": 4,
            "max": 15,
            "default": 5,
        },
        "resolution": {
            "type": "select",
            "label": "Resolution",
            "options": resolution_options,
            "default": "720p",
        },
        "generateAudio": {
            "type": "boolean",
            "label": "Generate Audio",
            "default": False,
        },
        "returnLastFrame": {
            "type": "boolean",
            "label": "Return Last Frame",
            "default": False,
        },
        "seed": COMMON_SEED_PARAM,
    }


def kling_provider(provider_id, label):
    standard_modes = ["text-to-video", "image-to-video"]
    omni_modes = ["omni-video"]
    quick_params = ["videoMode", "aspectRatio", "duration", "qualityMode"]
    omni_quick_params = ["aspectRatio", "duration", "qualityMode"]
    return {
        "id": provider_id,
        "label": label,
        "models": [
            {
                "id": "kling-v2-6",
                "label": "Kling V2.6",
                "family": "kling",
                "adapterKey": provider_id,
                "supportedModes": standard_modes,
                "inputCapabilities": {
                    "text": True,
                    "images": True,
                    "endFrame": False,
                    "endFrameByQualityMode": {
                        "std": False,
                        "pro": True,
                    },
                    "referenceImages": False,
                    "maxImages": 1,
                    "maxInputImageSizeMb": 10,
                },
                "quickParams": quick_params,
                "params": kling_params(standard_modes, KLING_STANDARD_DURATION_OPTIONS),
                "customParams": {},
            },
            {
                "id": "kling-v3",
                "label": "Kling V3",
                "family": "kling",
                "adapterKey": provider_id,
                "supportedModes": standard_modes,
                "inputCapabilities": {
                    "text": True,
                    "images": True,
                    "endFrame": True,
                    "endFrameByQualityMode": {
                        "std": True,
                        "pro": True,
                    },
                    "referenceImages": False,
                    "maxImages": 1,
                    "maxInputImageSizeMb": 10,
                },
                "capabilities": {
                    "cfgScale": True,
                    "multiShot": {
                        "supported": True,
                        "modes": ["text-to-video", "image-to-video"],
                        "shotTypes": ["intelligence", "customize"],
                        "maxShots": 6,
                        "promptMaxLength": 512,
                        "durationRange": [3, 15],
                    },
                    "cameraControl": {
                        "supported": True,
                        "modes": ["text-to-video", "image-to-video"],
                        "presets": ["down_back", "forward_up", "right_turn_forward", "left_turn_forward"],
                        "simpleAxes": ["horizontal", "vertical", "pan", "tilt", "roll", "zoom"],
                        "valueRange": [-10, 10],
                        "incompatibleWith": ["endImage"],
                    },
                },
                "quickParams": quick_params,
                "params": KLING_V3_PARAMS,
                "customParams": {
                    "kling": {
                        "shotMode": "single",
                        "cfgScale": 0.5,
                        "cameraControl": {
                            "type": "none",
                            "axis": "pan",
                            "value": 0,
                        },
                    }
                },
            },
            {
                "id": "kling-v3-omni",
                "label": "Kling V3 Omni",
                "family": "kling",
                "adapterKey": provider_id,
                "supportedModes": omni_modes,
                "inputCapabilities": {
                    "text": False,
                    "images": True,
                    "endFrame": False,
                    "referenceImages": True,
                    "maxImages": 7,
                    "maxReferenceImages": 7,
                    "maxInputImageSizeMb": 10,
                },
                "capabilities": {
                    "omniComposer": {
                        "supported": True,
                        "maxImages": 7,
                        "maxElements": 3,
                        "imageRoles": ["reference", "first_frame", "end_frame"],
                    }
                },
                "quickParams": omni_quick_params,
                "params": kling_params(omni_modes, KLING_EXTENDED_DURATION_OPTIONS),
                "customParams": {},
            },
        ],
    }

VIDEO_GENERATION_REGISTRY = {
    "providers": [
        {
            "id": "yunwu",
            "label": "Yunwu",
            "models": [
                {
                    "id": "veo3.1",
                    "label": "Veo 3.1",
                    "family": "veo",
                    "adapterKey": "yunwu_veo",
                    "supportedModes": ["text-to-video", "image-to-video"],
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "endFrame": True,
                        "referenceImages": False,
                        "maxImages": 1,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "enableUpsample"],
                    "params": YUNWU_VEO_PARAMS,
                    "customParams": {},
                },
                {
                    "id": "veo3.1-fast",
                    "label": "Veo 3.1 Fast",
                    "family": "veo",
                    "adapterKey": "yunwu_veo",
                    "supportedModes": ["text-to-video", "image-to-video"],
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "endFrame": True,
                        "referenceImages": False,
                        "maxImages": 1,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "enableUpsample"],
                    "params": YUNWU_VEO_PARAMS,
                    "customParams": {},
                },
                {
                    "id": "veo3.1-components",
                    "label": "Veo 3.1 Components",
                    "family": "veo",
                    "adapterKey": "yunwu_veo_components",
                    "supportedModes": ["reference-video"],
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "endFrame": False,
                        "referenceImages": True,
                        "maxImages": 3,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "enableUpsample"],
                    "params": {
                        "videoMode": {
                            "type": "select",
                            "label": "Video Mode",
                            "options": ["reference-video"],
                            "default": "reference-video",
                        },
                        "aspectRatio": {
                            "type": "select",
                            "label": "Aspect Ratio",
                            "options": ["16:9", "9:16"],
                            "default": "16:9",
                        },
                        "enableUpsample": {
                            "type": "boolean",
                            "label": "Upsample",
                            "default": False,
                        },
                        "veoFlClose": {
                            "type": "boolean",
                            "label": "Veo FL Close",
                            "default": True,
                        },
                        "seed": COMMON_SEED_PARAM,
                    },
                    "customParams": {"veoFlClose": True},
                },
            ],
        },
        {
            "id": "google",
            "label": "Google",
            "models": [
                {
                    "id": "veo-3.1-generate-001",
                    "label": "Veo 3.1",
                    "family": "veo",
                    "adapterKey": "google_veo",
                    "supportedModes": ["text-to-video", "image-to-video", "reference-video"],
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "endFrame": True,
                        "referenceImages": True,
                        "maxImages": 1,
                        "maxReferenceImages": 4,
                        "maxInputImageSizeMb": 20,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "duration", "resolution"],
                    "params": {
                        "videoMode": {
                            "type": "select",
                            "label": "Video Mode",
                            "options": ["text-to-video", "image-to-video", "reference-video"],
                            "default": "text-to-video",
                        },
                        "aspectRatio": {
                            "type": "select",
                            "label": "Aspect Ratio",
                            "options": ["16:9", "9:16"],
                            "default": "16:9",
                        },
                        "duration": {
                            "type": "select",
                            "label": "Duration",
                            "options": ["4s", "6s", "8s"],
                            "default": "8s",
                        },
                        "durationSeconds": {
                            "type": "number",
                            "label": "Duration Seconds",
                            "min": 4,
                            "max": 8,
                            "default": 8,
                        },
                        "resolution": {
                            "type": "select",
                            "label": "Resolution",
                            "options": ["720p", "1080p"],
                            "default": "720p",
                        },
                        "generateAudio": {
                            "type": "boolean",
                            "label": "Generate Audio",
                            "default": True,
                        },
                        "seed": COMMON_SEED_PARAM,
                        "numberOfVideos": {
                            "type": "number",
                            "label": "Videos",
                            "min": 1,
                            "max": 4,
                            "default": 1,
                        },
                    },
                    "constraints": {
                        "durationByResolution": {"1080p": "8s"},
                        "durationByMode": {"reference-video": "8s"},
                    },
                    "customParams": {},
                },
                {
                    "id": "veo-3.1-fast-generate-001",
                    "label": "Veo 3.1 Fast",
                    "family": "veo",
                    "adapterKey": "google_veo_fast",
                    "supportedModes": ["text-to-video", "image-to-video", "reference-video"],
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "endFrame": True,
                        "referenceImages": True,
                        "maxImages": 1,
                        "maxReferenceImages": 4,
                        "maxInputImageSizeMb": 20,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "duration", "resolution"],
                    "params": {
                        "videoMode": {
                            "type": "select",
                            "label": "Video Mode",
                            "options": ["text-to-video", "image-to-video", "reference-video"],
                            "default": "text-to-video",
                        },
                        "aspectRatio": {
                            "type": "select",
                            "label": "Aspect Ratio",
                            "options": ["16:9", "9:16"],
                            "default": "16:9",
                        },
                        "duration": {
                            "type": "select",
                            "label": "Duration",
                            "options": ["4s", "6s", "8s"],
                            "default": "8s",
                        },
                        "durationSeconds": {
                            "type": "number",
                            "label": "Duration Seconds",
                            "min": 4,
                            "max": 8,
                            "default": 8,
                        },
                        "resolution": {
                            "type": "select",
                            "label": "Resolution",
                            "options": ["720p", "1080p"],
                            "default": "720p",
                        },
                        "generateAudio": {
                            "type": "boolean",
                            "label": "Generate Audio",
                            "default": True,
                        },
                        "seed": COMMON_SEED_PARAM,
                        "numberOfVideos": {
                            "type": "number",
                            "label": "Videos",
                            "min": 1,
                            "max": 4,
                            "default": 1,
                        },
                    },
                    "constraints": {
                        "durationByResolution": {"1080p": "8s"},
                        "durationByMode": {"reference-video": "8s"},
                    },
                    "customParams": {},
                },
                {
                    "id": "veo-3.1-lite-generate-001",
                    "label": "Veo 3.1 Lite",
                    "family": "veo",
                    "adapterKey": "google_veo_lite",
                    "supportedModes": ["text-to-video", "image-to-video"],
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "endFrame": True,
                        "referenceImages": False,
                        "maxImages": 1,
                        "maxReferenceImages": 0,
                        "maxInputImageSizeMb": 20,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "duration", "resolution"],
                    "params": {
                        "videoMode": {
                            "type": "select",
                            "label": "Video Mode",
                            "options": ["text-to-video", "image-to-video"],
                            "default": "text-to-video",
                        },
                        "aspectRatio": {
                            "type": "select",
                            "label": "Aspect Ratio",
                            "options": ["16:9", "9:16"],
                            "default": "16:9",
                        },
                        "duration": {
                            "type": "select",
                            "label": "Duration",
                            "options": ["4s", "6s", "8s"],
                            "default": "8s",
                        },
                        "durationSeconds": {
                            "type": "number",
                            "label": "Duration Seconds",
                            "min": 4,
                            "max": 8,
                            "default": 8,
                        },
                        "resolution": {
                            "type": "select",
                            "label": "Resolution",
                            "options": ["720p", "1080p"],
                            "default": "720p",
                        },
                        "generateAudio": {
                            "type": "boolean",
                            "label": "Generate Audio",
                            "default": True,
                        },
                        "seed": COMMON_SEED_PARAM,
                        "numberOfVideos": {
                            "type": "number",
                            "label": "Videos",
                            "min": 1,
                            "max": 4,
                            "default": 1,
                        },
                    },
                    "constraints": {"durationByResolution": {"1080p": "8s"}},
                    "customParams": {},
                },
            ],
        },
        {
            "id": "seedance_official",
            "label": "Seedance",
            "models": [
                {
                    "id": "doubao-seedance-2-0-260128",
                    "label": "Seedance 2.0",
                    "family": "seedance",
                    "adapterKey": "seedance_official",
                    "supportedModes": SEEDANCE_MODES,
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "videos": True,
                        "audios": True,
                        "firstFrame": True,
                        "lastFrame": True,
                        "referenceImages": True,
                        "referenceVideos": True,
                        "referenceAudios": True,
                        "maxImages": 9,
                        "maxVideos": 3,
                        "maxAudios": 3,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "duration", "resolution"],
                    "params": seedance_params(["480p", "720p", "1080p"]),
                    "customParams": {"seedance": {}},
                },
                {
                    "id": "doubao-seedance-2-0-fast-260128",
                    "label": "Seedance 2.0 Fast",
                    "family": "seedance",
                    "adapterKey": "seedance_official",
                    "supportedModes": SEEDANCE_MODES,
                    "inputCapabilities": {
                        "text": True,
                        "images": True,
                        "videos": True,
                        "audios": True,
                        "firstFrame": True,
                        "lastFrame": True,
                        "referenceImages": True,
                        "referenceVideos": True,
                        "referenceAudios": True,
                        "maxImages": 9,
                        "maxVideos": 3,
                        "maxAudios": 3,
                    },
                    "quickParams": ["videoMode", "aspectRatio", "duration", "resolution"],
                    "params": seedance_params(["480p", "720p"]),
                    "customParams": {"seedance": {}},
                },
            ],
        },
        kling_provider("kling", "Kling"),
        kling_provider("yunwu-kling", "Yunwu Kling"),
        {
            "id": "kie",
            "label": "KIE",
            "models": [
                kie_video_model(model_id, label, family, mode)
                for model_id, label, family, mode in KIE_VIDEO_MODEL_WHITELIST
            ],
        },
    ]
}


def get_video_model_specs():
    from video_generation.capabilities import list_video_model_capabilities

    legacy_registry = deepcopy(VIDEO_GENERATION_REGISTRY)
    capabilities = list_video_model_capabilities(legacy_registry)
    # Phase 1 temporary bridge: providers/models preserves the current frontend
    # contract. Phase 2/3 should remove legacy fields after VideoNode consumes
    # capabilities directly.
    return {
        "schemaVersion": 1,
        "providers": legacy_registry["providers"],
        "models": legacy_registry["providers"],
        "capabilities": capabilities,
    }


def get_legacy_video_model_specs():
    return deepcopy(VIDEO_GENERATION_REGISTRY)
