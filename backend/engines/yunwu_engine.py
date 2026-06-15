# backend/engines/yunwu_engine.py
from .base import BaseEngine
from settings_resolver import resolve_provider_secret


class YunwuEngine(BaseEngine):
    def __init__(self, api_key: str | None = None, base_url: str = "https://yunwu.ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

        # UI labels and legacy aliases are normalized to provider model ids here.
        self.MODEL_MAP = {
            "Nano pro": "gemini-3-pro-image-preview",
            "Nano Pro": "gemini-3-pro-image-preview",
            "nano-pro": "gemini-3-pro-image-preview",
            "nanopro": "gemini-3-pro-image-preview",
            "gemini-3-pro-image-preview": "gemini-3-pro-image-preview",
            "Nano 2": "gemini-3.1-flash-image-preview",
            "nano-2": "gemini-3.1-flash-image-preview",
            "nano2": "gemini-3.1-flash-image-preview",
            "gemini-3.1-flash-image-preview": "gemini-3.1-flash-image-preview",
            "GPT-2": "gpt-image-2",
            "gpt-2": "gpt-image-2",
            "gpt-image-2": "gpt-image-2",
            "gpt_image_2": "gpt-image-2",
            "GPT Image 2": "gpt-image-2",
        }
        self.MODEL_ALIAS_MAP = {self._alias_key(key): value for key, value in self.MODEL_MAP.items()}
        self.GPT_IMAGE_MODELS = {"gpt-image-2"}
        self.NANO_MODELS = {"gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"}

    def _alias_key(self, value) -> str:
        return "".join(ch for ch in str(value).lower() if ch.isalnum())

    def _normalize_model(self, model_key):
        return self.MODEL_MAP.get(model_key) or self.MODEL_ALIAS_MAP.get(self._alias_key(model_key), model_key)

    def _resolve_api_key(self) -> str:
        api_key = resolve_provider_secret("yunwu", "apiKey", "YUNWU_API_KEY") or self.api_key
        if not api_key:
            raise ValueError(
                "Yunwu credentials are not configured. Please configure them in Settings -> Providers."
            )
        return api_key

    async def generate(self, config: dict, prompt: str, gen_dir: str, image_inputs=None):
        model_key = config.get("model", "Nano 2")
        target_id = self._normalize_model(model_key)
        api_key = self._resolve_api_key()

        print(f"[DEBUG] Yunwu model normalized | model_key={model_key} | target_id={target_id}")

        # Route by normalized provider model id, not by UI display label.
        if target_id in self.GPT_IMAGE_MODELS:
            from .yunwu_handlers.gpt_handler import GptHandler

            handler = GptHandler(api_key, self.base_url)
            return await handler.handle(config, prompt, gen_dir, image_inputs, target_id, model_key=model_key)

        from .yunwu_handlers.nano_handler import NanoHandler

        handler = NanoHandler(api_key, self.base_url)
        return await handler.handle(config, prompt, gen_dir, target_id, image_inputs=image_inputs, model_key=model_key)
