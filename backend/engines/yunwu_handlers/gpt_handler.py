# backend/engines/yunwu_handlers/gpt_handler.py
import base64
import io
import math

import httpx

from ..image_utils import encode_base64, mime_to_extension, prepare_provider_image_inputs, save_base64_image


class GptHandler:
    MIN_PIXELS = 655360
    MAX_PIXELS = 8294400
    MAX_SIDE = 3840

    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url

    def _round16(self, value):
        return max(16, int(round(float(value) / 16)) * 16)

    def _parse_aspect_ratio(self, value):
        if not value or value == "auto":
            return None
        if ":" not in str(value):
            return None
        left, right = str(value).split(":", 1)
        left = float(left)
        right = float(right)
        if left <= 0 or right <= 0:
            return None
        return left / right

    def _resize_by_scale(self, width, height, scale):
        return self._round16(width * scale), self._round16(height * scale)

    def _fit_gpt_image_size(self, width, height):
        original_width = width
        original_height = height

        if max(width, height) > self.MAX_SIDE:
            width, height = self._resize_by_scale(width, height, self.MAX_SIDE / max(width, height))

        pixels = width * height
        if pixels > self.MAX_PIXELS:
            width, height = self._resize_by_scale(width, height, math.sqrt(self.MAX_PIXELS / pixels))

        pixels = width * height
        if pixels < self.MIN_PIXELS:
            width, height = self._resize_by_scale(width, height, math.sqrt(self.MIN_PIXELS / pixels))

        if max(width, height) > self.MAX_SIDE:
            width, height = self._resize_by_scale(width, height, self.MAX_SIDE / max(width, height))

        for _ in range(20):
            if width * height >= self.MIN_PIXELS:
                break
            width, height = self._resize_by_scale(width, height, 1.01)
            if max(width, height) > self.MAX_SIDE:
                width, height = self._resize_by_scale(width, height, self.MAX_SIDE / max(width, height))
                break

        for _ in range(20):
            if width * height <= self.MAX_PIXELS:
                break
            width, height = self._resize_by_scale(width, height, 0.99)

        if max(width, height) > self.MAX_SIDE:
            width, height = self._resize_by_scale(width, height, self.MAX_SIDE / max(width, height))

        if (width, height) != (original_width, original_height):
            print(
                "[Yunwu GPT image size fit]",
                {
                    "before": f"{original_width}x{original_height}",
                    "after": f"{width}x{height}",
                    "pixels": width * height,
                },
            )

        return width, height

    def _validate_gpt_image_size(self, width, height):
        pixels = width * height
        if width % 16 != 0 or height % 16 != 0:
            raise ValueError("gpt-image-2 width and height must be multiples of 16")
        if max(width, height) > self.MAX_SIDE:
            raise ValueError("gpt-image-2 max side must be <= 3840")
        if max(width, height) / min(width, height) > 3:
            raise ValueError("gpt-image-2 aspect ratio must be <= 3:1")
        if pixels < self.MIN_PIXELS or pixels > self.MAX_PIXELS:
            raise ValueError("gpt-image-2 total pixels must be between 655360 and 8294400")

    def _calculate_dimensions(self, ratio_str, resolution_str):
        if not ratio_str or ratio_str == "auto":
            return "auto"
        if not resolution_str or resolution_str == "auto":
            return "auto"

        ratio = self._parse_aspect_ratio(ratio_str)
        if not ratio:
            return "auto"
        if ratio > 3 or ratio < 1 / 3:
            raise ValueError("gpt-image-2 size ratio must be <= 3:1")

        long_side_by_resolution = {
            "1K": 1024,
            "2K": 2048,
            "4K": 3840,
        }
        target_long_side = long_side_by_resolution.get(str(resolution_str))
        if not target_long_side:
            return "auto"

        if ratio >= 1:
            width = target_long_side
            height = target_long_side / ratio
        else:
            height = target_long_side
            width = target_long_side * ratio

        width = self._round16(width)
        height = self._round16(height)

        width, height = self._fit_gpt_image_size(width, height)
        self._validate_gpt_image_size(width, height)
        return f"{width}x{height}"

    def _response_items(self, response_json):
        data = response_json.get("data", [])
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        return []

    async def _save_response_url(self, url, gen_dir, output_format):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(url)
                response.raise_for_status()
            mime_type = response.headers.get("content-type", "").split(";")[0] or f"image/{output_format}"
            return save_base64_image(encode_base64(response.content), gen_dir, "gpt2", mime_type)
        except Exception as exc:
            print(
                "Yunwu GPT Image URL download failed, returning remote URL | "
                f"url={url[:160]} | "
                f"error={str(exc)}"
            )
            return url

    async def _extract_saved_urls(self, response_json, response_text, gen_dir, output_format):
        saved_urls = []
        for item in self._response_items(response_json):
            if not isinstance(item, dict):
                continue

            b64_data = item.get("b64_json") or item.get("base64") or item.get("b64")
            if b64_data:
                mime_type = item.get("mime_type") or item.get("mimeType") or f"image/{output_format}"
                saved_urls.append(save_base64_image(b64_data, gen_dir, "gpt2", mime_type))
                continue

            url = item.get("url")
            if url:
                saved_urls.append(await self._save_response_url(url, gen_dir, output_format))

        if saved_urls:
            return saved_urls

        choices = response_json.get("choices")
        if isinstance(choices, list):
            for choice in choices:
                content = choice.get("message", {}).get("content") if isinstance(choice, dict) else None
                if not isinstance(content, str):
                    continue
                stripped = content.strip()
                if stripped.startswith("data:image/") or "," in stripped:
                    try:
                        b64_data = stripped.split(",", 1)[1] if stripped.startswith("data:image/") else stripped
                        base64.b64decode(b64_data)
                        saved_urls.append(save_base64_image(b64_data, gen_dir, "gpt2", f"image/{output_format}"))
                    except Exception:
                        pass

        if saved_urls:
            return saved_urls

        print(
            "Yunwu GPT Image API response parse failed | "
            f"keys={list(response_json.keys()) if isinstance(response_json, dict) else type(response_json)} | "
            f"response={response_text[:1000]}"
        )
        return []

    async def handle(self, config, prompt, gen_dir, image_inputs, target_id, model_key=None):
        if not self.api_key:
            print("[ERROR] GPT-2 API key is empty. Check YUNWU_API_KEY.")
            return ""

        size = self._calculate_dimensions(
            config.get("aspectRatio") or config.get("aspect_ratio") or config.get("ratio", "1:1"),
            config.get("size") or config.get("imageSize") or config.get("image_size") or config.get("resolution", "1K"),
        )
        print(
            "[Yunwu GPT image size]",
            {
                "aspectRatio": config.get("aspectRatio") or config.get("aspect_ratio") or config.get("ratio", "1:1"),
                "resolution": config.get("size") or config.get("imageSize") or config.get("image_size") or config.get("resolution", "1K"),
                "resolvedSize": size,
            },
        )
        output_format = config.get("format") or config.get("output_format") or config.get("outputFormat") or "png"
        quality = config.get("quality") or "auto"
        n = int(config.get("n", 1) or 1)

        try:
            images = await prepare_provider_image_inputs(image_inputs or [], gen_dir, prefer="base64")
        except Exception as e:
            print(
                "Yunwu GPT Image input failed | "
                f"model={target_id} | "
                f"error={str(e)}"
            )
            return ""

        if len(images) >= 16:
            print(f"Yunwu GPT Image input failed | model={target_id} | error=image count must be less than 16")
            return ""

        total_bytes = sum(len(image.raw_data or b"") for image in images)
        if total_bytes > 50 * 1024 * 1024:
            print(f"Yunwu GPT Image input failed | model={target_id} | error=image inputs exceed 50MB")
            return ""

        files = [
            (
                "image",
                (
                    image.filename or f"image_{index}.{mime_to_extension(image.mime_type)}",
                    io.BytesIO(image.raw_data),
                    image.mime_type,
                ),
            )
            for index, image in enumerate(images, start=1)
        ]

        endpoint = "/v1/images/edits" if files else "/v1/images/generations"
        api_url = f"{self.base_url}{endpoint}"
        mode = "image-edit" if files else "text-to-image"

        common_payload = {
            "model": target_id,
            "prompt": prompt,
            "size": size,
            "quality": quality,
        }

        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        masked_headers = {**headers, "Authorization": "Bearer ***"}

        print(
            "[Yunwu GPT image]",
            {
                "mode": mode,
                "url": api_url,
                "model": target_id,
                "modelKey": model_key or config.get("model"),
                "promptLength": len(prompt or ""),
                "imageCount": len(images),
                "size": size,
                "quality": quality,
                "format": output_format,
                "headers": masked_headers,
                "files": [
                    {
                        "filename": image.filename or f"image_{index}.{mime_to_extension(image.mime_type)}",
                        "mime": image.mime_type,
                        "bytes": len(image.raw_data or b""),
                    }
                    for index, image in enumerate(images, start=1)
                ],
            },
        )

        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                if files:
                    data = {
                        **common_payload,
                        "n": str(n),
                    }
                    if config.get("background"):
                        data["background"] = str(config.get("background"))
                    if config.get("moderation"):
                        data["moderation"] = str(config.get("moderation"))
                    response = await client.post(api_url, headers=headers, data=data, files=files)
                else:
                    json_payload = {
                        **common_payload,
                        "n": n,
                        "format": output_format,
                    }
                    json_headers = {
                        **headers,
                        "Content-Type": "application/json",
                    }
                    response = await client.post(api_url, headers=json_headers, json=json_payload)

                if response.status_code >= 400:
                    print(
                        "[Yunwu GPT image error] "
                        f"model={target_id} | "
                        f"endpoint={endpoint} | "
                        f"status={response.status_code} | "
                        f"response={response.text[:1000]}"
                    )
                    return ""

                response_json = response.json()
                saved_urls = await self._extract_saved_urls(response_json, response.text, gen_dir, output_format)

                if not saved_urls:
                    print(
                        "Yunwu GPT Image API returned no b64_json | "
                        f"model={target_id} | "
                        f"endpoint={endpoint} | "
                        f"response={response.text[:1000]}"
                    )
                    return ""
                return saved_urls if len(saved_urls) > 1 else saved_urls[0]
        except Exception as e:
            print(
                "Yunwu GPT Image Handler Exception | "
                f"model={target_id} | "
                f"endpoint={endpoint} | "
                f"error={str(e)}"
            )
            return ""
