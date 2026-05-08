# backend/engines/yunwu_engine.py
import os
import uuid
import base64
import httpx
import json
import math
from .base import BaseEngine



class YunwuEngine(BaseEngine):
    def __init__(self, api_key: str, base_url: str = "https://yunwu.ai"):
        self.api_key = api_key
        # 统一处理 Base URL 末尾斜杠
        self.base_url = base_url.rstrip('/')
        
        # 映射表保持与前端 ImageNode.jsx 一致
        self.MODEL_MAP = {
            "Nano Pro": "gemini-3-pro-image-preview",
            "Nano 2": "gemini-3.1-flash-image-preview",
            "GPT-2": "gpt-image-2"
        }

    def _calculate_gpt_dimensions(self, ratio_str: str, resolution_str: str):
        """🌟 动态像素换算器：意图 -> 物理像素"""
        # 1. 确定目标面积
        target_area = {
            "512": 655360, "1K": 1024 * 1024, "2K": 2048 * 1152, "4K": 8294400
        }.get(resolution_str, 1024 * 1024)

        # 2. 解析比例并限制在 3:1 以内
        try:
            w_p, h_p = map(int, ratio_str.split(':'))
            aspect = max(0.33, min(3.0, w_p / h_p))
        except: aspect = 1.0

        # 3. 计算宽高并对齐 16 像素栅格
        w = math.sqrt(target_area * aspect)
        h = target_area / w
        real_w = int(round(w / 16) * 16)
        real_h = int(round(h / 16) * 16)

        # 4. 最终边界校验 (最大边 3840, 最小面积 655360)
        max_side = max(real_w, real_h)
        if max_side > 3840:
            scale = 3840 / max_side
            real_w = int(round((real_w * scale) / 16) * 16)
            real_h = int(round((real_h * scale) / 16) * 16)
            
        return f"{real_w}x{real_h}"

    async def generate(self, config: dict, prompt: str, gen_dir: str, image_input=None):
        model = config.get("model", "Nano 2")

            # 🌟 GPT-2 专用逻辑分支
        if model == "GPT-2":
            size = self._calculate_gpt_dimensions(config.get("ratio", "1:1"), config.get("resolution", "1K"))
            
            # 判断是文生图还是多图编辑
            if image_input and (isinstance(image_input, list) or isinstance(image_input, str)):
                # 走 /v1/images/edits (Multipart)
                return await self._call_yunwu_edits(prompt, image_input, size, config, gen_dir)
            else:
                # 走 /v1/images/generations (JSON)
                return await self._call_yunwu_generations(prompt, size, config, gen_dir)
        
        """
        config 参数包含: model, ratio, resolution
        save_dir 为 projectPath/generation 路径
        """
        model_key = config.get("model", "Nano 2")
        target_id = self.MODEL_MAP.get(model_key, model_key)
        
        # 组装云雾 API URL
        api_url = f"{self.base_url}/v1beta/models/{target_id}:generateContent?key={self.api_key}"
        
        # 1. 组装请求载荷
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {
                    "aspectRatio": config.get("ratio", "16:9")
                }
            }
        }


        
        if config.get("resolution") and model_key in ["Nano Pro", "Nano 2"]:
            payload["generationConfig"]["imageConfig"]["imageSize"] = config.get("resolution")

        try:
            # 2. 发起异步请求，设置较长的超时时间以应对图像生成
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(api_url, json=payload)
                
                if response.status_code != 200:
                    print(f"[ERROR] Yunwu API HttpError: {response.status_code}")
                    return ""

                data = response.json()
                candidate = data.get("candidates", [{}])[0]
                
                if candidate.get("finishReason") == "SAFETY":
                    print("[ERROR] Generation failed: Safety Filter triggered.")
                    return ""

                # 3. 提取并持久化图像
                part = candidate.get("content", {}).get("parts", [{}])[0]
                inline_data_obj = part.get("inlineData", {})
                inline_data = inline_data_obj.get("data")
                mime_type = inline_data_obj.get("mimeType", "image/png")

                if inline_data:
                    # 🌟 动态识别扩展名，确保文件头与后缀匹配
                    mime_map = {
                        "image/jpeg": "jpg",
                        "image/png": "png",
                        "image/webp": "webp"
                    }
                    ext = mime_map.get(mime_type, "png")
                    file_name = f"yunwu_{uuid.uuid4().hex[:8]}.{ext}"
                    file_path = os.path.join(gen_dir, file_name)
                    
                    # 🌟 核心改进：强力清洗所有空白符、换行符
                    raw_data = "".join(inline_data.split())
                    
                    # 剥离可能存在的 Data URL 前缀
                    if "," in raw_data:
                        raw_data = raw_data.split(",")[1]
                    
                    try:
                        # 4. 解码并写入二进制流
                        image_bytes = base64.b64decode(raw_data)
                        with open(file_path, "wb") as f:
                            f.write(image_bytes)
                        
                        # 使用纯文本日志，避免 Windows 终端编码崩溃
                        print(f"[SUCCESS] Image saved: {file_name} ({len(image_bytes)} bytes)")
                        return f"/api/image/{file_name}"
                    except Exception as decode_err:
                        print(f"[ERROR] Base64 Decode Failed: {decode_err}")
                        return ""
                
                return ""
            
        except Exception as e:
            # 捕获整个系统的异步请求异常
            print(f"[ERROR] Yunwu Engine System Error: {str(e)}")
            return ""