from copy import deepcopy


def _model(model_id: str, label: str, *, images: bool, local_soft_skills: bool = False) -> dict:
    return {
        "id": model_id,
        "label": label,
        "enabled": True,
        "supportsText": True,
        "supportsImages": images,
        "supportsSystemPrompt": True,
        "supportsTemperature": True,
        "supportsMaxTokens": True,
        "streaming": False,
        "capabilities": {
            "supportsImages": images,
            "supportsThinking": False,
            "supportsReasoningEffort": False,
            "supportsStreaming": False,
            "supportsTools": False,
            "supportsJsonMode": False,
            "supportsHistory": False,
            "supportsLocalSoftSkills": local_soft_skills,
        },
    }


def _provider(provider_id: str, label: str, models: list[dict], parameters: dict | None = None) -> dict:
    return {
        "id": provider_id,
        "label": label,
        "models": models,
        "parameters": parameters or {
            "thinkingLevel": {"enabled": False},
            "temperature": {
                "enabled": True,
                "label": "Temperature",
                "default": 0.85,
                "min": 0,
                "max": 2,
                "step": 0.05,
            },
            "maxTokens": {
                "enabled": True,
                "label": "Max Tokens",
                "default": 8192,
                "min": 256,
                "max": 65535,
                "step": 256,
            },
        },
    }


THINKING_LEVEL_PARAMETERS = {
    "thinkingLevel": {
        "enabled": True,
        "label": "Thinking",
        "default": "medium",
        "options": [
            {"id": "low", "label": "Low"},
            {"id": "medium", "label": "Medium"},
            {"id": "high", "label": "High"},
        ],
    },
    "temperature": {
        "enabled": True,
        "label": "Temperature",
        "default": 0.85,
        "min": 0,
        "max": 2,
        "step": 0.05,
    },
    "maxTokens": {
        "enabled": True,
        "label": "Max Tokens",
        "default": 8192,
        "min": 256,
        "max": 65535,
        "step": 256,
    },
}


DEEPSEEK_PARAMETERS = {
    "thinking": {
        "enabled": True,
        "label": "Thinking",
        "default": "enabled",
        "options": [{"id": "enabled", "label": "Enabled"}, {"id": "disabled", "label": "Disabled"}],
    },
    "reasoningEffort": {
        "enabled": True,
        "label": "Reasoning",
        "default": "high",
        "options": [{"id": "high", "label": "High"}, {"id": "max", "label": "Max"}],
    },
    "thinkingLevel": {"enabled": False},
    "temperature": {"enabled": False},
    "maxTokens": {
        "enabled": True,
        "label": "Max Tokens",
        "default": 8192,
        "min": 256,
        "max": 65535,
        "step": 256,
    },
}


LLM_SPECS = {
    "schemaVersion": 1,
    "providers": [
        _provider(
            "Google",
            "Google Cloud",
            [
                {**_model("gemini-3.1-flash-lite", "Gemini 3.1 Flash", images=True), "capabilities": {**_model("", "", images=True)["capabilities"], "supportsThinking": True}},
                {**_model("gemini-3.1-pro-preview", "Gemini 3.1 Pro", images=True), "capabilities": {**_model("", "", images=True)["capabilities"], "supportsThinking": True}},
            ],
            THINKING_LEVEL_PARAMETERS,
        ),
        _provider(
            "google_studio",
            "Google Studio",
            [
                _model("gemini-3.5-flash", "Gemini 3.5 Flash", images=True),
                _model("gemini-3.1-pro-preview", "Gemini 3.1 Pro (Preview)", images=True),
                _model("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", images=True),
            ],
        ),
        _provider(
            "Yunwu",
            "Yunwu",
            [
                _model("gemini-3.1-flash-lite", "Gemini 3.1 Flash", images=True),
                _model("gemini-3.1-pro-preview", "Gemini 3.1 Pro", images=True),
                _model("gpt-5.4-mini", "GPT 5.4 Mini", images=True),
            ],
        ),
        _provider(
            "deepseek",
            "DeepSeek",
            [
                _model("deepseek-v4-flash", "DeepSeek V4 Flash", images=False, local_soft_skills=True),
                _model("deepseek-v4-pro", "DeepSeek V4 Pro", images=False, local_soft_skills=True),
            ],
            DEEPSEEK_PARAMETERS,
        ),
        _provider(
            "openai",
            "OpenAI",
            [
                _model("gpt-5.5", "GPT 5.5", images=True),
                _model("gpt-5.4-mini", "GPT 5.4 Mini", images=True),
                _model("gpt-5.4-nano", "GPT 5.4 Nano", images=True),
            ],
        ),
        _provider(
            "anthropic",
            "Claude",
            [
                _model("claude-opus-4-8", "Claude Opus 4.8", images=True),
                _model("claude-sonnet-4-6", "Claude Sonnet 4.6", images=True),
                _model("claude-haiku-4-5-20251001", "Claude Haiku 4.5", images=True),
            ],
        ),
    ],
}


def get_llm_specs() -> dict:
    return deepcopy(LLM_SPECS)
