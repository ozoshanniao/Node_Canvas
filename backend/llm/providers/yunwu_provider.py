import httpx

from .base import BaseLLMProvider, LLMProviderError
from ..schemas import LLMGenerateRequest


class YunwuLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None, base_url: str = "https://yunwu.ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def generate(self, request: LLMGenerateRequest) -> str:
        if not self.api_key:
            raise LLMProviderError("YUNWU_API_KEY is not configured")

        endpoint = "/v1/chat/completions"
        api_url = f"{self.base_url}{endpoint}"
        payload = {
            "model": request.model,
            "messages": [{"role": "user", "content": request.inputText}],
            "temperature": request.temperature if request.temperature is not None else 0.85,
            "max_tokens": request.maxTokens if request.maxTokens is not None else 8192,
            "stream": False,
        }
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        print(
            "[DEBUG] Yunwu LLM request | "
            f"model={request.model} | "
            f"endpoint={endpoint} | "
            f"temperature={payload['temperature']} | "
            f"max_tokens={payload['max_tokens']} | "
            "headers={'Authorization': 'Bearer ***', 'Content-Type': 'application/json'}"
        )

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(api_url, headers=headers, json=payload)

        if response.status_code != 200:
            raise LLMProviderError(
                "Yunwu LLM API Failed | "
                f"model={request.model} | "
                f"endpoint={endpoint} | "
                f"status={response.status_code} | "
                f"response={response.text}"
            )

        response_json = response.json()
        try:
            text = response_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMProviderError(f"Yunwu LLM response missing choices[0].message.content: {response.text}") from exc

        return text or ""

