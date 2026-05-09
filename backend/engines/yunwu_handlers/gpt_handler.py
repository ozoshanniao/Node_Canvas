# backend/engines/yunwu_handlers/gpt_handler.py
import io
import math

import httpx

from ..image_utils import prepare_provider_image_inputs, save_base64_image


class GptHandler:
    def __init__(self, api_key, base_url):
        self.api_key = api_key
        self.base_url = base_url

    def _calculate_dimensions(self, ratio_str, resolution_str):
        """Keep the existing dynamic pixel calculation."""
        target_area = {"512": 655360, "1K": 1024 * 1024, "2K": 2359296, "4K": 8294400}.get(
            resolution_str, 1024 * 1024
        )
        try:
            w_p, h_p = map(int, ratio_str.split(":"))
            aspect = max(0.33, min(3.0, w_p / h_p))
        except Exception:
            aspect = 1.0
        w = math.sqrt(target_area * aspect)
        h = target_area / w
        return f"{int(round(w / 16) * 16)}x{int(round(h / 16) * 16)}"

    def _response_items(self, response_json):
        data = response_json.get("data", [])
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        return []

    async def handle(self, config, prompt, gen_dir, image_inputs, target_id, model_key=None):
        if not self.api_key:
            print("[ERROR] GPT-2 API key is empty. Check YUNWU_API_KEY.")
            return ""

        size = self._calculate_dimensions(config.get("ratio", "1:1"), config.get("resolution", "1K"))
        output_format = config.get("format") or config.get("output_format") or "png"

        try:
            images = await prepare_provider_image_inputs(image_inputs or [], gen_dir, prefer="base64")
        except Exception as e:
            print(
                "Yunwu GPT Image input failed | "
                f"model={target_id} | "
                f"error={str(e)}"
            )
            return ""

        files = [
            ("image", (image.filename or f"image_{index}.png", io.BytesIO(image.raw_data), image.mime_type))
            for index, image in enumerate(images, start=1)
        ]

        endpoint = "/v1/images/edits" if files else "/v1/images/generations"
        api_url = f"{self.base_url}{endpoint}"
        mode = "edits" if files else "generations"

        common_payload = {
            "model": target_id,
            "prompt": prompt,
            "size": size,
            "quality": config.get("quality", "auto"),
        }

        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        masked_headers = {**headers, "Authorization": "Bearer ***"}

        print(
            "[DEBUG] Yunwu GPT Image request | "
            f"model_key={model_key or config.get('model')} | "
            f"target_id={target_id} | "
            f"payload_model={common_payload['model']} | "
            f"endpoint={endpoint} | "
            f"mode={mode} | "
            f"size={size} | "
            f"quality={common_payload['quality']} | "
            f"format={output_format} | "
            f"headers={masked_headers}"
        )

        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                if files:
                    data = {
                        **common_payload,
                        "n": str(config.get("n", 1)),
                    }
                    response = await client.post(api_url, headers=headers, data=data, files=files)
                else:
                    json_payload = {
                        **common_payload,
                        "n": int(config.get("n", 1)),
                        "format": output_format,
                    }
                    response = await client.post(api_url, headers=headers, json=json_payload)

                if response.status_code != 200:
                    print(
                        "Yunwu GPT Image API Failed | "
                        f"model={target_id} | "
                        f"endpoint={endpoint} | "
                        f"status={response.status_code} | "
                        f"response={response.text}"
                    )
                    return ""

                saved_urls = []
                for item in self._response_items(response.json()):
                    b64_data = item.get("b64_json") if isinstance(item, dict) else None
                    if not b64_data:
                        continue

                    mime_type = item.get("mime_type") or item.get("mimeType") or f"image/{output_format}"
                    saved_urls.append(save_base64_image(b64_data, gen_dir, "gpt2", mime_type))

                if not saved_urls:
                    print(
                        "Yunwu GPT Image API returned no b64_json | "
                        f"model={target_id} | "
                        f"endpoint={endpoint} | "
                        f"response={response.text}"
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
