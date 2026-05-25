import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx

from engines.image_utils import encode_base64, infer_mime_type, prepare_provider_image_input
from video_generation.providers.base import BaseVideoProvider
from video_generation.schemas import VideoGenerateRequest


YUNWU_CREATE_URL = "https://yunwu.ai/v1/video/create"
YUNWU_QUERY_URL = "https://yunwu.ai/v1/video/query"


class YunwuVeoProvider(BaseVideoProvider):
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("YUNWU_API_KEY")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise ValueError("YUNWU_API_KEY is not configured")
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _response_payload(self, response: httpx.Response) -> dict:
        try:
            payload = response.json()
        except ValueError:
            payload = {"detail": response.text}
        if not isinstance(payload, dict):
            payload = {"detail": payload}
        return payload

    def _base_payload(self, request: VideoGenerateRequest) -> dict:
        payload = {
            "model": request.model,
            "prompt": request.prompt,
            "aspect_ratio": request.aspectRatio or "16:9",
            "enhance_prompt": bool(request.customParams.get("enhancePrompt", True)),
            "enable_upsample": bool(request.enableUpsample),
        }
        if request.negativePrompt:
            payload["negative_prompt"] = request.negativePrompt
        return payload

    def _local_proxy_path(self, project_path: str | None, value: str) -> str | None:
        if not project_path:
            return None

        parsed = urlparse(value)
        raw_path = unquote(parsed.path or value)
        parts = [part for part in raw_path.replace("\\", "/").split("/") if part]
        filename = os.path.basename(raw_path)
        if not filename:
            return None

        project = Path(project_path)
        if len(parts) >= 3 and parts[-3] == "api" and parts[-2] == "input":
            candidate = project / "input" / filename
        elif len(parts) >= 3 and parts[-3] == "api" and parts[-2] in {"image", "generated"}:
            candidate = project / "generation" / filename
        elif len(parts) >= 2 and parts[-2] == "input":
            candidate = project / "input" / filename
        elif len(parts) >= 2 and parts[-2] == "generation":
            candidate = project / "generation" / filename
        else:
            candidate = None

        if candidate and candidate.exists():
            return str(candidate)
        return None

    async def _image_for_yunwu(self, project_path: str | None, value: str) -> str:
        parsed = urlparse(value or "")
        if parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() not in {
            "127.0.0.1",
            "localhost",
            "0.0.0.0",
            "::1",
        }:
            return value

        local_path = self._local_proxy_path(project_path, value)
        image = await prepare_provider_image_input(local_path or value, str(Path(project_path) / "generation") if project_path else None)
        if not image.raw_data:
            raise ValueError(f"Unable to read image input: {value}")
        mime_type = image.mime_type or infer_mime_type(image.raw_data)
        base64_data = image.base64_data or encode_base64(image.raw_data)
        return f"data:{mime_type};base64,{base64_data}"

    async def _images_for_request(self, request: VideoGenerateRequest) -> list[str]:
        if request.videoMode == "text-to-video":
            return []

        if request.videoMode == "image-to-video":
            images = []
            if request.images:
                images.append(await self._image_for_yunwu(request.projectPath, request.images[0]))
            if request.endImage:
                images.append(await self._image_for_yunwu(request.projectPath, request.endImage))
            return images

        if request.videoMode == "reference-video":
            return [
                await self._image_for_yunwu(request.projectPath, image)
                for image in (request.images or [])[:3]
            ]

        raise ValueError(f"Unsupported video mode: {request.videoMode}")

    async def create_task(self, request: VideoGenerateRequest) -> dict:
        payload = self._base_payload(request)

        if request.videoMode == "image-to-video":
            if not request.images:
                raise ValueError("image-to-video requires a start image")
            images = await self._images_for_request(request)
            payload["images"] = images
            if len(images) > 1:
                payload["veo_fl_close"] = bool(request.customParams.get("veoFlClose", True))
        elif request.videoMode == "reference-video":
            if request.model != "veo3.1-components":
                raise ValueError("reference-video is only supported by veo3.1-components")
            images = await self._images_for_request(request)
            if not images:
                raise ValueError("reference-video requires at least one reference image")
            payload["images"] = images
            payload["veo_fl_close"] = bool(request.customParams.get("veoFlClose", True))
        elif request.videoMode != "text-to-video":
            raise ValueError(f"Unsupported video mode: {request.videoMode}")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(YUNWU_CREATE_URL, headers=self._headers(), json=payload)
            if response.is_error:
                payload = self._response_payload(response)
                raise ValueError(f"Yunwu create failed: {payload}")
            response.raise_for_status()
            return self._response_payload(response)

    async def query_task(self, provider_task_id: str) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                YUNWU_QUERY_URL,
                headers=self._headers(),
                params={"id": provider_task_id},
            )
            if response.is_error:
                payload = self._response_payload(response)
                return {
                    "status": "error",
                    "http_status": response.status_code,
                    "detail": payload.get("detail", payload),
                    "message": payload.get("message"),
                }
            response.raise_for_status()
            return self._response_payload(response)
