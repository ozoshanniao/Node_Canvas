import asyncio
import os
from typing import Optional

from google import genai
from google.genai import types

from .base import BaseLLMProvider, LLMProviderError
from ..schemas import LLMGenerateRequest


class GoogleLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None):
        self.api_key = api_key or os.getenv("GOOGLE_CLOUD_API_KEY")
        self.client = None

        if self.api_key:
            self.client = genai.Client(
                vertexai=True,
                api_key=self.api_key,
            )

    async def generate(self, request: LLMGenerateRequest) -> str:
        return await self._generate_text(
            model=request.model,
            input_text=request.inputText,
            temperature=request.temperature if request.temperature is not None else 0.85,
            max_tokens=request.maxTokens if request.maxTokens is not None else 8192,
            thinking_level=request.thinkingLevel,
        )

    async def _generate_text(
        self,
        *,
        model: str,
        input_text: str,
        temperature: float,
        max_tokens: int,
        thinking_level: Optional[str] = None,
    ) -> str:
        if not self.api_key or not self.client:
            raise LLMProviderError("GOOGLE_CLOUD_API_KEY is missing")

        safety_settings = [
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
        ]
        config_kwargs = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "safety_settings": safety_settings,
        }

        if thinking_level:
            config_kwargs["thinking_config"] = types.ThinkingConfig(
                thinking_level=thinking_level.upper()
            )

        generate_content_config = types.GenerateContentConfig(**config_kwargs)

        response = await asyncio.to_thread(
            self.client.models.generate_content,
            model=model,
            contents=input_text,
            config=generate_content_config,
        )

        if response.text:
            return response.text

        parts = []
        for candidate in getattr(response, "candidates", []) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", []) or []:
                text = getattr(part, "text", None)
                if text:
                    parts.append(text)

        return "".join(parts)
