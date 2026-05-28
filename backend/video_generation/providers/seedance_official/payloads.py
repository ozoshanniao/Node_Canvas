import re

from media.public_asset_service import PublicAssetService
from video_generation.schemas import VideoGenerateRequest


SEEDANCE_FAST_MODEL = "doubao-seedance-2-0-fast-260128"


def normalize_provider_prompt_references(prompt: str) -> str:
    def replace_at(match):
        media_type = match.group(1)
        index = int(match.group(2))
        labels = {
            "image": "图片",
            "图片": "图片",
            "video": "视频",
            "视频": "视频",
            "audio": "音频",
            "音频": "音频",
        }
        return f"{labels[media_type]}{index}"

    value = re.sub(r"@(image|图片|video|视频|audio|音频)_?(\d+)", replace_at, str(prompt or ""))
    return re.sub(r"<<<(image|video|audio)_(\d+)>>>", replace_at, value)


def _parse_duration_seconds(request: VideoGenerateRequest) -> int:
    raw = request.durationSeconds
    if raw is None and request.duration:
        try:
            raw = int(str(request.duration).strip().lower().replace("s", ""))
        except ValueError:
            raw = None
    duration = int(raw or 5)
    if duration < 4 or duration > 15:
        raise ValueError("Seedance duration must be between 4 and 15 seconds")
    return duration


class SeedancePayloadBuilder:
    VALID_RATIOS = {"adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}
    VALID_RESOLUTIONS = {"480p", "720p", "1080p"}
    FAST_RESOLUTIONS = {"480p", "720p"}

    def __init__(self, public_asset_service: PublicAssetService | None = None):
        self.public_assets = public_asset_service or PublicAssetService()

    def _seedance_params(self, request: VideoGenerateRequest) -> dict:
        params = request.customParams.get("seedance") if isinstance(request.customParams, dict) else None
        return params if isinstance(params, dict) else {}

    def _resolution(self, request: VideoGenerateRequest) -> str:
        resolution = request.resolution if request.resolution in self.VALID_RESOLUTIONS else "720p"
        if request.model == SEEDANCE_FAST_MODEL and resolution == "1080p":
            raise ValueError("Seedance fast model does not support 1080p resolution")
        if request.model == SEEDANCE_FAST_MODEL and resolution not in self.FAST_RESOLUTIONS:
            raise ValueError("Seedance fast model supports only 480p and 720p")
        return resolution

    async def _public_urls(self, values: list[str], project_path: str | None) -> list[str]:
        return [str(value) for value in values if value]

    async def _payload_asset_url(self, value: str, project_path: str | None) -> str:
        return str(value)

    def _base_payload(self, request: VideoGenerateRequest, content: list[dict]) -> dict:
        ratio = request.aspectRatio if request.aspectRatio in self.VALID_RATIOS else "adaptive"
        payload = {
            "model": request.model,
            "content": content,
            "ratio": ratio,
            "duration": _parse_duration_seconds(request),
            "resolution": self._resolution(request),
            "generate_audio": bool(request.generateAudio),
            "return_last_frame": bool(request.returnLastFrame),
            "watermark": False,
        }
        if request.seed is not None and request.seed >= 0:
            payload["seed"] = request.seed
        return payload

    async def build_payload(self, request: VideoGenerateRequest, project_path: str | None) -> dict:
        params = self._seedance_params(request)
        mode = params.get("mode") or request.videoMode
        prompt = normalize_provider_prompt_references(request.prompt)
        content = [{"type": "text", "text": prompt}]

        if mode == "frame":
            first_frame = params.get("firstFrame") or (request.images[0] if request.images else None)
            last_frame = params.get("lastFrame") or request.endImage
            if not first_frame:
                raise ValueError("Seedance frame mode requires firstFrame")
            first_url = await self._payload_asset_url(first_frame, project_path)
            content.append({
                "type": "image_url",
                "image_url": {"url": first_url},
                "role": "first_frame",
            })
            if last_frame:
                last_url = await self._payload_asset_url(last_frame, project_path)
                content.append({
                    "type": "image_url",
                    "image_url": {"url": last_url},
                    "role": "last_frame",
                })
            return self._base_payload(request, content)

        if mode != "multimodal-reference":
            raise ValueError(f"Unsupported Seedance mode: {mode}")

        images = [value for value in (params.get("images") or []) if value]
        videos = [value for value in (params.get("videos") or []) if value]
        audios = [value for value in (params.get("audios") or []) if value]
        if len(images) > 9:
            raise ValueError("Seedance multimodal-reference supports at most 9 images")
        if len(videos) > 3:
            raise ValueError("Seedance multimodal-reference supports at most 3 videos")
        if len(audios) > 3:
            raise ValueError("Seedance multimodal-reference supports at most 3 audios")
        if audios and not images and not videos:
            raise ValueError("Seedance multimodal-reference does not allow audio-only references")

        for url in await self._public_urls(images, project_path):
            content.append({
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            })
        for url in await self._public_urls(videos, project_path):
            content.append({
                "type": "video_url",
                "video_url": {"url": url},
                "role": "reference_video",
            })
        for url in await self._public_urls(audios, project_path):
            content.append({
                "type": "audio_url",
                "audio_url": {"url": url},
                "role": "reference_audio",
            })
        return self._base_payload(request, content)
