from .providers.base import LLMProviderError
from .providers.anthropic_provider import AnthropicLLMProvider
from .providers.deepseek_provider import DeepSeekLLMProvider
from .providers.google_provider import GoogleLLMProvider
from .providers.google_studio_provider import GoogleStudioLLMProvider
from .providers.openai_provider import OpenAILLMProvider
from .providers.yunwu_provider import YunwuLLMProvider
from .schemas import LLMGenerateRequest
from .skills.loader import get_enabled_skill_instructions


LOCAL_SOFT_SKILLS_PROVIDER = "deepseek"
LOCAL_SOFT_SKILLS_UNSUPPORTED_MESSAGE = (
    "Local Soft Skills are currently supported only for DeepSeek Official models."
)


class LLMService:
    def __init__(
        self,
        yunwu_api_key: str | None = None,
        google_api_key: str | None = None,
        deepseek_api_key: str | None = None,
        deepseek_base_url: str | None = None,
        openai_api_key: str | None = None,
        openai_base_url: str | None = None,
        anthropic_api_key: str | None = None,
    ):
        self.providers = {
            "yunwu": YunwuLLMProvider(api_key=yunwu_api_key),
            "google": GoogleLLMProvider(api_key=google_api_key),
            "google_studio": GoogleStudioLLMProvider(),
            "deepseek": DeepSeekLLMProvider(api_key=deepseek_api_key, base_url=deepseek_base_url),
            "openai": OpenAILLMProvider(api_key=openai_api_key, base_url=openai_base_url),
            "anthropic": AnthropicLLMProvider(api_key=anthropic_api_key),
        }

    def _with_soft_skills(self, request: LLMGenerateRequest, provider_key: str) -> LLMGenerateRequest:
        if not request.enabledSkills:
            return request

        if provider_key != LOCAL_SOFT_SKILLS_PROVIDER:
            raise LLMProviderError(LOCAL_SOFT_SKILLS_UNSUPPORTED_MESSAGE)

        skill_section = get_enabled_skill_instructions(request.enabledSkills, request.projectPath)
        if not skill_section:
            return request

        base_system = (request.systemPrompt or "You are a helpful assistant.").strip()
        return request.model_copy(update={
            "systemPrompt": f"{base_system}\n\n{skill_section}",
        })

    async def generate(self, request: LLMGenerateRequest) -> str:
        provider_key = (request.provider or "").strip().lower()
        provider = self.providers.get(provider_key)

        if not provider:
            raise LLMProviderError(f"LLM provider is not supported: {request.provider}")

        return await provider.generate(self._with_soft_skills(request, provider_key))
