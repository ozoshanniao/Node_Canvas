from .providers.base import LLMProviderError
from .providers.deepseek_provider import DeepSeekLLMProvider
from .providers.google_provider import GoogleLLMProvider
from .providers.yunwu_provider import YunwuLLMProvider
from .schemas import LLMGenerateRequest


class LLMService:
    def __init__(
        self,
        yunwu_api_key: str | None = None,
        google_api_key: str | None = None,
        deepseek_api_key: str | None = None,
        deepseek_base_url: str | None = None,
    ):
        self.providers = {
            "yunwu": YunwuLLMProvider(api_key=yunwu_api_key),
            "google": GoogleLLMProvider(api_key=google_api_key),
            "deepseek": DeepSeekLLMProvider(api_key=deepseek_api_key, base_url=deepseek_base_url),
        }

    async def generate(self, request: LLMGenerateRequest) -> str:
        provider_key = (request.provider or "").strip().lower()
        provider = self.providers.get(provider_key)

        if not provider:
            raise LLMProviderError(f"LLM provider is not supported: {request.provider}")

        return await provider.generate(request)
