import httpx

from .base import BaseLLMProvider, LLMProviderError
from ..image_inputs import prepare_llm_image_inputs
from ..schemas import LLMGenerateRequest


def _safe_url_prefix(url: str) -> str:
    if not url:
        return ""
    return f"{url[:80]}..." if len(url) > 80 else url


def _safe_content_for_log(content):
    if isinstance(content, str):
        return {
            "kind": "string",
            "preview": content[:120],
        }

    safe_parts = []
    for part in content:
        if part.get("type") == "image_url":
            url = part.get("image_url", {}).get("url", "")
            safe_parts.append(
                {
                    "type": "image_url",
                    "urlPrefix": _safe_url_prefix(url),
                    "isDataUrl": url.startswith("data:image/"),
                    "isHttp": url.startswith("http://") or url.startswith("https://"),
                }
            )
        else:
            safe_parts.append(
                {
                    "type": part.get("type"),
                    "textPreview": part.get("text", "")[:120],
                }
            )
    return {
        "kind": "list",
        "parts": safe_parts,
    }


class YunwuLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None, base_url: str = "https://yunwu.ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def generate(self, request: LLMGenerateRequest) -> str:
        if not self.api_key:
            raise LLMProviderError("YUNWU_API_KEY is not configured")

        endpoint = "/v1/chat/completions"
        api_url = f"{self.base_url}{endpoint}"
        prepared_images = await prepare_llm_image_inputs(
            request.imageInputs,
            request.projectPath,
            prefer_public_urls=True,
        )
        prompt_text = request.inputText or "Analyze the attached image(s)."

        if prepared_images:
            prompt_text = (
                "Images are provided in order as Image 1, Image 2, Image 3, and so on. "
                "When the user refers to image1 or Image 1, use the first image.\n\n"
                f"{prompt_text}"
            )
            message_content = [
                {"type": "text", "text": prompt_text},
                *[
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image.url_for_api,
                        },
                    }
                    for image in prepared_images
                ],
            ]
        else:
            message_content = prompt_text

        payload = {
            "model": request.model,
            "messages": [{"role": "user", "content": message_content}],
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
            "[Yunwu LLM request]",
            {
                "url": api_url,
                "model": payload.get("model"),
                "stream": payload.get("stream"),
                "messageRole": payload["messages"][0].get("role"),
                "contentKind": "list" if isinstance(payload["messages"][0].get("content"), list) else "string",
                "content": _safe_content_for_log(payload["messages"][0].get("content")),
                "temperature": payload.get("temperature"),
                "max_tokens": payload.get("max_tokens"),
                "images": len(prepared_images),
            },
        )

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(api_url, headers=headers, json=payload)

        if response.status_code >= 400:
            error_text = response.text or ""
            print("[Yunwu LLM error]", response.status_code, error_text[:1000])
            raise LLMProviderError(
                "Yunwu LLM API error | "
                f"model={request.model} | "
                f"endpoint={endpoint} | "
                f"status={response.status_code} | "
                f"response={error_text[:500]}"
            )

        response_json = response.json()
        try:
            text = response_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMProviderError(f"Yunwu LLM response missing choices[0].message.content: {response.text}") from exc

        return text or ""
