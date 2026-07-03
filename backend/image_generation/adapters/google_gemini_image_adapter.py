import asyncio

from google import genai
from google.genai import types

from engines.image_utils import prepare_provider_image_input
from ..schemas import ImageInputItem
from ..storage import save_image_bytes


class GoogleGeminiImageAdapter:
    def __init__(self, api_key: str):
        self.client = genai.Client(
            vertexai=True,
            api_key=api_key,
        )

    def _ordered_image_inputs(self, image_inputs):
        ordered_items = []
        for fallback_index, item in enumerate(image_inputs or []):
            if isinstance(item, ImageInputItem):
                ordered_items.append(item)
            elif isinstance(item, dict):
                ordered_items.append(
                    ImageInputItem(
                        index=int(item.get("index", fallback_index)),
                        url=item.get("url"),
                    )
                )
            elif isinstance(item, str):
                ordered_items.append(ImageInputItem(index=fallback_index, url=item))

        return [item for item in sorted(ordered_items, key=lambda image: image.index) if item.url]

    def _final_prompt(self, prompt: str, image_count: int) -> str:
        if image_count <= 0:
            return prompt
        return (
            "The input images are provided in order.\n"
            "Image 1 corresponds to the first input image, Image 2 corresponds to the second input image, and so on.\n"
            "Follow the user's prompt references to Image 1, Image 2, Image 3, etc. according to this order.\n\n"
            f"User prompt:\n{prompt}"
        )

    def _config(self, config: dict, model: str):
        aspect_ratio = config.get("ratio") or config.get("aspectRatio") or "auto"
        image_size = config.get("imageSize") or config.get("image_size") or config.get("resolution") or "1K"
        config_kwargs = {
            "temperature": config.get("temperature", 1),
            "top_p": 0.95,
            "max_output_tokens": 32768,
            "response_modalities": ["TEXT", "IMAGE"],
            "safety_settings": [
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
            ],
            "image_config": types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                output_mime_type="image/png",
            ),
        }

        if model == "gemini-3.1-flash-image":
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="MINIMAL")

        return types.GenerateContentConfig(**config_kwargs)

    async def _parts(self, request, ordered_inputs):
        parts = [types.Part.from_text(text=self._final_prompt(request.prompt, len(ordered_inputs)))]

        for item in ordered_inputs:
            image = await prepare_provider_image_input(item.url, request.generation_dir, prefer="base64")
            parts.append(
                types.Part.from_bytes(
                    data=image.raw_data,
                    mime_type=image.mime_type,
                )
            )

        return parts

    async def generate(self, request, model: str):
        ordered_inputs = self._ordered_image_inputs(request.image_inputs)
        print(
            "[GoogleImageAdapter] image inputs "
            f"count: {len(ordered_inputs)}, indexes: {[item.index for item in ordered_inputs]}"
        )

        parts = await self._parts(request, ordered_inputs)
        contents = [
            types.Content(
                role="user",
                parts=parts,
            )
        ]
        generate_content_config = self._config(request.config, model)

        response = await asyncio.to_thread(
            self.client.models.generate_content,
            model=model,
            contents=contents,
            config=generate_content_config,
        )

        saved_urls = []
        debug_text_parts = []
        candidates = getattr(response, "candidates", []) or []
        if candidates:
            content = getattr(candidates[0], "content", None)
            for part in getattr(content, "parts", []) or []:
                inline_data = getattr(part, "inline_data", None)
                if inline_data:
                    image_data = getattr(inline_data, "data", None)
                    mime_type = getattr(inline_data, "mime_type", None) or "image/png"
                    if isinstance(image_data, str):
                        import base64

                        image_data = base64.b64decode(image_data)
                    if image_data:
                        saved_urls.append(save_image_bytes(image_data, request.generation_dir, "google", mime_type))
                    continue

                text = getattr(part, "text", None)
                if text:
                    debug_text_parts.append(text)

        if not saved_urls:
            debug_text = "\n".join(debug_text_parts)
            raise RuntimeError(f"Google Gemini image response returned no image. Text: {debug_text}")

        return saved_urls if len(saved_urls) > 1 else saved_urls[0]

