import asyncio
import os
from typing import Optional

from google import genai
from google.genai import types

from .base import BaseLLMProvider, LLMProviderError
from ..image_inputs import prepare_llm_image_inputs
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
            image_inputs=request.imageInputs,
            project_path=request.projectPath,
            temperature=request.temperature if request.temperature is not None else 0.85,
            max_tokens=request.maxTokens if request.maxTokens is not None else 8192,
            thinking_level=request.thinkingLevel,
        )

    async def _generate_text(
        self,
        *,
        model: str,
        input_text: str,
        image_inputs,
        project_path: str | None,
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

        try:
            prepared_images = await prepare_llm_image_inputs(image_inputs, project_path)
        except Exception as exc:
            raise LLMProviderError(f"Failed to prepare Google LLM image input: {exc}") from exc

        prompt_text = (input_text or "").strip()

        if prepared_images:
            prompt_text = (
                "The attached images are ordered as Image 1, Image 2, Image 3, and so on. "
                "When the user refers to image1 or Image 1, use the first image.\n\n"
                f"{prompt_text or '请分析这些图片。'}"
            )
        else:
            prompt_text = prompt_text or "Please provide a response."

        parts = []
        for image in prepared_images:
            if not image.raw_data:
                raise LLMProviderError(f"Failed to prepare Google LLM image input at index {image.index}: missing bytes")
            parts.append(
                types.Part.from_bytes(
                    data=image.raw_data,
                    mime_type=image.mime_type or "image/png",
                )
            )

        parts.append(types.Part.from_text(text=prompt_text))

        contents = [
            types.Content(
                role="user",
                parts=parts,
            )
        ]

        print(
            "[Google LLM request]",
            {
                "model": model,
                "images": len(prepared_images),
                "parts": ["image" for _ in prepared_images] + ["text"],
                "mimeTypes": [image.mime_type for image in prepared_images],
                "inputTextLength": len(prompt_text),
            },
        )

        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=model,
                contents=contents,
                config=generate_content_config,
            )
        except Exception as exc:
            print("[Google LLM error]", repr(exc))
            raise LLMProviderError(f"Google LLM generation failed: {exc}") from exc

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
