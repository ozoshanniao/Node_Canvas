# backend/engines/yunwu_handlers/nano_handler.py
import httpx

from ..image_utils import prepare_provider_image_inputs, save_base64_image


class NanoHandler:
    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url

    def _image_config(self, config):
        aspect_ratio = config.get("aspectRatio") or config.get("aspect_ratio") or config.get("ratio") or "1:1"
        image_size = config.get("imageSize") or config.get("image_size") or config.get("resolution")
        image_config = {"aspectRatio": aspect_ratio}
        if image_size:
            image_config["imageSize"] = image_size
        return image_config

    def _mode_for_count(self, image_count):
        if image_count == 0:
            return "text-to-image"
        if image_count == 1:
            return "image-to-image"
        return "multi-image"

    def _extract_inline_images(self, response_json):
        for candidate in response_json.get("candidates", []):
            content = candidate.get("content", {})
            for part in content.get("parts", []):
                inline_data = part.get("inlineData") or part.get("inline_data") or {}
                image_data = inline_data.get("data")
                if not image_data:
                    continue
                mime_type = inline_data.get("mimeType") or inline_data.get("mime_type") or "image/png"
                yield image_data, mime_type

    async def handle(self, config, prompt, gen_dir, target_id, image_inputs=None, model_key=None):
        if not self.api_key:
            print("[ERROR] Yunwu Nano API key is empty. Check YUNWU_API_KEY.")
            return ""

        endpoint = f"/v1beta/models/{target_id}:generateContent"
        api_url = f"{self.base_url}{endpoint}?key={self.api_key}"
        image_config = self._image_config(config)

        try:
            images = await prepare_provider_image_inputs(image_inputs or [], gen_dir, prefer="base64")
        except Exception as e:
            print(
                "Yunwu Nano image input failed | "
                f"model={target_id} | "
                f"error={str(e)}"
            )
            return ""

        mode = self._mode_for_count(len(images))
        parts = [{"text": prompt}]
        for image in images:
            parts.append(
                {
                    "inline_data": {
                        "mime_type": image.mime_type,
                        "data": image.base64_data,
                    }
                }
            )

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": parts,
                }
            ],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": image_config,
            },
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        print(
            "[DEBUG] Yunwu Nano request | "
            f"model_key={model_key or config.get('model')} | "
            f"target_id={target_id} | "
            f"endpoint={endpoint} | "
            f"mode={mode} | "
            f"aspectRatio={image_config.get('aspectRatio')} | "
            f"imageSize={image_config.get('imageSize')} | "
            f"image_input_count={len(images)} | "
            "headers={'Authorization': 'Bearer ***', 'Content-Type': 'application/json'}"
        )

        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(api_url, headers=headers, json=payload)

            if response.status_code != 200:
                print(
                    "Yunwu Nano API Failed | "
                    f"model={target_id} | "
                    f"endpoint={endpoint} | "
                    f"status={response.status_code} | "
                    f"response={response.text}"
                )
                return ""

            response_json = response.json()
            candidate = response_json.get("candidates", [{}])[0]
            if candidate.get("finishReason") == "SAFETY":
                print(f"Yunwu Nano API blocked by safety filter | model={target_id} | endpoint={endpoint}")
                return ""

            saved_urls = []
            for image_data, mime_type in self._extract_inline_images(response_json):
                try:
                    saved_urls.append(save_base64_image(image_data, gen_dir, "nano", mime_type))
                except Exception as e:
                    print(
                        "Yunwu Nano image save failed | "
                        f"provider=Yunwu | "
                        f"model={target_id} | "
                        f"mime_type={mime_type} | "
                        f"target_dir={gen_dir} | "
                        f"error={str(e)}"
                    )
                    return ""

            if not saved_urls:
                print(
                    "Yunwu Nano API returned no inline image | "
                    f"model={target_id} | "
                    f"endpoint={endpoint} | "
                    f"response={response.text}"
                )
                return ""

            return saved_urls if len(saved_urls) > 1 else saved_urls[0]
        except Exception as e:
            print(
                "Yunwu Nano Handler Exception | "
                f"model={target_id} | "
                f"endpoint={endpoint} | "
                f"error={str(e)}"
            )
            return ""
