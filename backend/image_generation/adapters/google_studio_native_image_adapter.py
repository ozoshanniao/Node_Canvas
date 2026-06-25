import asyncio
import base64
from urllib.parse import urlparse

from google import genai

from engines.image_utils import prepare_provider_image_input
from ..schemas import ImageInputItem
from ..storage import save_image_bytes


ALLOWED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
OUTPUT_MIME_TYPES = {
    "png": "image/png",
    "image/png": "image/png",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
}


def _is_public_http_url(value: str | None) -> bool:
    parsed = urlparse(str(value or ""))
    return parsed.scheme in {"http", "https"}


class GoogleStudioNativeImageAdapter:
    def __init__(self, api_key: str, client=None):
        self.api_key = api_key
        self.client = client or genai.Client(api_key=api_key)

    def _safe_error(self, error: Exception) -> RuntimeError:
        message = str(error) or error.__class__.__name__
        if self.api_key:
            message = message.replace(self.api_key, "[redacted]")
        if len(message) > 500:
            message = f"{message[:500]}..."
        if message.startswith("Google Studio:"):
            return RuntimeError(message)
        return RuntimeError(f"Google Studio: {message}")

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

    def _response_format(self, config: dict):
        aspect_ratio = config.get("ratio") or config.get("aspectRatio") or "1:1"
        image_size = config.get("imageSize") or config.get("image_size") or config.get("resolution") or "1K"
        output_format = config.get("outputFormat") or config.get("output_format") or "png"
        mime_type = OUTPUT_MIME_TYPES.get(str(output_format).lower())
        if not mime_type:
            raise ValueError(f"unsupported output format: {output_format}")

        return {
            "type": "image",
            "aspect_ratio": aspect_ratio,
            "image_size": image_size,
            "mime_type": mime_type,
        }

    async def _image_input_parts(self, request, ordered_inputs):
        if len(ordered_inputs) > 14:
            raise ValueError("Google Studio supports at most 14 input images")

        image_parts = []
        for item in ordered_inputs:
            if _is_public_http_url(item.url):
                raise ValueError("remote image URLs are not supported for Google Studio image generation")
            image = await prepare_provider_image_input(item.url, request.generation_dir, prefer="base64")
            if not image.raw_data:
                raise ValueError("image input is empty")
            mime_type = (image.mime_type or "").lower()
            if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
                raise ValueError(f"unsupported image MIME type: {image.mime_type}")
            base64_data = image.base64_data or base64.b64encode(image.raw_data).decode("ascii")
            image_parts.append({
                "type": "image",
                "data": base64_data,
                "mime_type": "image/jpeg" if mime_type == "image/jpg" else mime_type,
            })
        return image_parts

    async def _input_payload(self, request):
        ordered_inputs = self._ordered_image_inputs(request.image_inputs)
        if not ordered_inputs:
            return request.prompt or ""

        image_parts = await self._image_input_parts(request, ordered_inputs)
        return [{"type": "text", "text": request.prompt or ""}, *image_parts]

    def _decode_image_data(self, data) -> bytes:
        if isinstance(data, bytes):
            image_bytes = data
        else:
            payload = str(data or "").split(",", 1)[-1]
            image_bytes = base64.b64decode(payload, validate=False)
        if not image_bytes:
            raise ValueError("image output is empty")
        return image_bytes

    def _output_image_from_steps(self, steps):
        for step in reversed(list(steps or [])):
            found = self._find_image_content(step)
            if found:
                return found
        return None

    def _find_image_content(self, value, seen=None):
        if seen is None:
            seen = set()
        value_id = id(value)
        if value_id in seen:
            return None
        seen.add(value_id)

        if isinstance(value, dict):
            value_type = value.get("type")
            if value_type == "image" and value.get("data"):
                return value
            for nested in value.values():
                found = self._find_image_content(nested, seen)
                if found:
                    return found
            return None

        if isinstance(value, (list, tuple)):
            for nested in value:
                found = self._find_image_content(nested, seen)
                if found:
                    return found
            return None

        for attr in ("content", "contents", "items", "output", "outputs", "parts"):
            if hasattr(value, attr):
                found = self._find_image_content(getattr(value, attr), seen)
                if found:
                    return found

        if getattr(value, "type", None) == "image" and getattr(value, "data", None):
            return value
        return None

    def _extract_image(self, interaction):
        output_image = getattr(interaction, "output_image", None)
        if output_image and getattr(output_image, "data", None):
            return output_image

        step_image = self._output_image_from_steps(getattr(interaction, "steps", None))
        if isinstance(step_image, dict):
            return type("StudioImageOutput", (), {
                "data": step_image.get("data"),
                "mime_type": step_image.get("mime_type") or step_image.get("mimeType"),
            })()
        return step_image

    async def generate(self, request, model: str):
        try:
            input_payload = await self._input_payload(request)
            interaction = await asyncio.to_thread(
                self.client.interactions.create,
                model=model,
                input=input_payload,
                response_format=self._response_format(request.config),
            )

            output_image = self._extract_image(interaction)
            if not output_image or not getattr(output_image, "data", None):
                raise RuntimeError("no image output returned")

            mime_type = (getattr(output_image, "mime_type", None) or "image/png").lower()
            if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
                raise RuntimeError(f"unsupported output MIME type: {mime_type}")
            image_bytes = self._decode_image_data(getattr(output_image, "data", None))
            return save_image_bytes(image_bytes, request.generation_dir, "google_studio", mime_type)
        except Exception as error:
            raise self._safe_error(error) from error
