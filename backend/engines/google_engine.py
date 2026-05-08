import os, uuid, base64
from google import genai
from google.genai import types
from .base import BaseEngine

class GoogleEngine(BaseEngine):
    def __init__(self, api_key: str):
        self.client = genai.Client(vertexai=True, api_key=api_key)

    async def generate(self, config: dict, prompt: str, save_dir: str) -> str:
        try:
            response = self.client.models.generate_content(
                model=config.get("model", "gemini-3.1-flash-image-preview"),
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=config.get('ratio', '1:1'))
                )
            )
            image_part = next((p.inline_data for p in response.candidates[0].content.parts if p.inline_data), None)
            if image_part:
                file_name = f"{uuid.uuid4()}.png"
                file_path = os.path.join(save_dir, file_name)
                
                # 🌟 修复 PNG 损坏：判断并解码 Base64
                raw_data = image_part.data
                if isinstance(raw_data, str):
                    raw_data = base64.b64decode(raw_data)
                
                with open(file_path, "wb") as f:
                    f.write(raw_data)
                return f"/api/image/{file_name}"
            return ""
        except Exception as e:
            print(f"AI Error: {e}")
            return ""