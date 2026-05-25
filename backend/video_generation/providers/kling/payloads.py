from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image

from engines.image_utils import encode_base64, infer_mime_type, prepare_provider_image_input
from video_generation.schemas import VideoGenerateRequest


STANDARD_DURATIONS = {"5", "10"}
EXTENDED_DURATIONS = {str(value) for value in range(3, 16)}


def parse_kling_duration(value, allowed: set[str] | None = None, default: str = "5") -> str:
    raw = str(value if value is not None else default).strip().lower()
    if raw.endswith("s"):
        raw = raw[:-1]
    try:
        normalized = str(int(float(raw)))
    except ValueError:
        normalized = default
    if allowed and normalized not in allowed:
        return default
    return normalized


class KlingPayloadBuilder:
    MAX_IMAGE_BYTES = 10 * 1024 * 1024
    VALID_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png"}

    def _local_proxy_path(self, project_path: str | None, value: str) -> str | None:
        if not project_path:
            return None

        parsed = urlparse(value)
        raw_path = unquote(parsed.path or value)
        parts = [part for part in raw_path.replace("\\", "/").split("/") if part]
        filename = Path(raw_path).name
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

    def _duration_for_request(self, request: VideoGenerateRequest) -> str:
        allowed = EXTENDED_DURATIONS if request.model in {"kling-v3", "kling-v3-omni"} else STANDARD_DURATIONS
        return parse_kling_duration(request.duration or request.durationSeconds, allowed=allowed, default="5")

    def _quality_mode(self, request: VideoGenerateRequest) -> str:
        value = str(getattr(request, "qualityMode", None) or request.customParams.get("qualityMode") or "std").lower()
        return {
            "standard": "std",
            "std": "std",
            "high": "pro",
            "pro": "pro",
        }.get(value, "std")

    def _supports_image_tail(self, request: VideoGenerateRequest) -> bool:
        if request.model == "kling-v3-omni":
            return True
        if request.model == "kling-v3":
            return True
        if request.model == "kling-v2-6":
            return self._quality_mode(request) == "pro"
        return True

    def _sound(self, request: VideoGenerateRequest) -> str:
        return "on" if request.generateAudio else "off"

    def _cfg_scale(self, request: VideoGenerateRequest) -> float | None:
        if request.model != "kling-v3":
            return None
        kling_params = request.customParams.get("kling") if isinstance(request.customParams, dict) else None
        value = None
        if isinstance(kling_params, dict):
            value = kling_params.get("cfgScale")
        if value is None:
            value = request.customParams.get("cfgScale") if isinstance(request.customParams, dict) else None
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return min(max(number, 0.0), 1.0)

    def _kling_custom_params(self, request: VideoGenerateRequest) -> dict:
        value = request.customParams.get("kling") if isinstance(request.customParams, dict) else None
        return value if isinstance(value, dict) else {}

    def _shot_mode(self, request: VideoGenerateRequest) -> str:
        kling_params = self._kling_custom_params(request)
        value = str(kling_params.get("shotMode") or kling_params.get("shotType") or "single").lower()
        if value in {"intelligence", "customize"}:
            return value
        return "single"

    def _validate_multi_prompt(self, multi_prompt) -> tuple[list[dict], int]:
        if not isinstance(multi_prompt, list) or not multi_prompt:
            raise ValueError("Kling multi_prompt requires at least one shot.")
        if len(multi_prompt) > 6:
            raise ValueError("Kling multi_prompt supports up to 6 shots.")

        normalized = []
        total_duration = 0
        for index, shot in enumerate(multi_prompt, start=1):
            if not isinstance(shot, dict):
                raise ValueError(f"Kling multi_prompt shot {index} must be an object.")
            prompt = str(shot.get("prompt") or "").strip()
            if not prompt:
                raise ValueError(f"Kling multi_prompt shot {index} prompt is required.")
            if len(prompt) > 512:
                raise ValueError(f"Kling multi_prompt shot {index} prompt must be 512 characters or less.")
            try:
                duration = int(str(shot.get("duration")).replace("s", ""))
            except (TypeError, ValueError):
                raise ValueError(f"Kling multi_prompt shot {index} duration must be an integer.") from None
            if duration < 1:
                raise ValueError(f"Kling multi_prompt shot {index} duration must be at least 1s.")
            total_duration += duration
            normalized.append({
                "prompt": prompt,
                "duration": str(duration),
            })

        if total_duration < 3 or total_duration > 15:
            raise ValueError("Kling multi_prompt total duration must be between 3s and 15s.")
        return normalized, total_duration

    def _apply_multi_shot(self, request: VideoGenerateRequest, payload: dict) -> None:
        shot_mode = self._shot_mode(request)
        if request.model != "kling-v3":
            if shot_mode != "single":
                if request.model == "kling-v2-6":
                    raise ValueError("Kling multi_shot is not supported for kling-v2-6.")
                if request.model == "kling-v3-omni":
                    raise ValueError("Kling multi_shot for kling-v3-omni is not supported yet.")
                raise ValueError(f"Kling multi_shot is not supported for {request.model}.")
            payload["multi_shot"] = False
            return

        if shot_mode == "single":
            payload["multi_shot"] = False
            return

        if shot_mode == "intelligence":
            if not str(request.prompt or "").strip():
                raise ValueError("Kling intelligence shot mode requires a prompt.")
            payload["multi_shot"] = True
            payload["shot_type"] = "intelligence"
            return

        kling_params = self._kling_custom_params(request)
        multi_prompt, total_duration = self._validate_multi_prompt(kling_params.get("multiPrompt"))
        payload["multi_shot"] = True
        payload["shot_type"] = "customize"
        payload["prompt"] = ""
        payload["multi_prompt"] = multi_prompt
        payload["duration"] = str(total_duration)

    async def resolve_image_for_kling(self, image_ref: str, project_path: str | None) -> str:
        parsed = urlparse(image_ref or "")
        if parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() not in {
            "127.0.0.1",
            "localhost",
            "0.0.0.0",
            "::1",
        }:
            return image_ref

        local_path = self._local_proxy_path(project_path, image_ref)
        image = await prepare_provider_image_input(
            local_path or image_ref,
            str(Path(project_path) / "generation") if project_path else None,
        )
        if not image.raw_data:
            raise ValueError(f"Kling image input could not be read: {image_ref}")

        if len(image.raw_data) > self.MAX_IMAGE_BYTES:
            raise ValueError("Kling image input must be 10MB or smaller")

        mime_type = (image.mime_type or infer_mime_type(image.raw_data)).lower()
        if mime_type not in self.VALID_MIME_TYPES:
            raise ValueError("Kling image input must be JPG, JPEG, or PNG")

        try:
            from io import BytesIO

            with Image.open(BytesIO(image.raw_data)) as img:
                width, height = img.size
        except Exception as exc:
            raise ValueError(f"Kling image input is not a valid image: {exc}") from exc

        if width < 300 or height < 300:
            raise ValueError("Kling image width and height must both be at least 300px")

        ratio = width / height
        if ratio < 0.4 or ratio > 2.5:
            raise ValueError("Kling image aspect ratio must be between 1:2.5 and 2.5:1")

        return image.base64_data or encode_base64(image.raw_data)

    def _apply_camera_control(self, request: VideoGenerateRequest, payload: dict) -> None:
        if request.model != "kling-v3":
            return

        if request.endImage:
            return

        kling_params = self._kling_custom_params(request)
        cc = kling_params.get("cameraControl")
        if not cc or not isinstance(cc, dict):
            return

        cc_type = str(cc.get("type", "none")).lower()
        if cc_type == "none":
            return

        valid_presets = {"down_back", "forward_up", "right_turn_forward", "left_turn_forward"}
        if cc_type in valid_presets:
            payload["camera_control"] = {
                "type": cc_type
            }
        elif cc_type == "simple":
            axis = str(cc.get("axis") or "").lower()
            value = cc.get("value", 0)

            valid_axes = {"horizontal", "vertical", "pan", "tilt", "roll", "zoom"}
            if not axis or axis not in valid_axes:
                raise ValueError("Invalid Kling camera_control axis.")

            try:
                val_num = float(value)
            except (TypeError, ValueError):
                val_num = 0.0

            clamped_val = max(-10.0, min(10.0, val_num))
            if clamped_val.is_integer():
                clamped_val = int(clamped_val)

            payload["camera_control"] = {
                "type": "simple",
                "config": {
                    axis: clamped_val
                }
            }
        else:
            raise ValueError("Invalid Kling camera_control type.")

    def _apply_element_list(self, request: VideoGenerateRequest, payload: dict) -> None:
        if request.model not in {"kling-v3", "kling-v3-omni"}:
            return

        kling_params = self._kling_custom_params(request)
        element_ids = kling_params.get("elementIds")
        if not isinstance(element_ids, list):
            return

        processed_ids = []
        for eid in element_ids:
            if eid is None:
                continue
            eid_str = str(eid).strip()
            if not eid_str:
                continue
            if not eid_str.isdigit():
                raise ValueError("Invalid Kling element ID.")
            processed_ids.append(int(eid_str))

        if not processed_ids:
            return

        if len(processed_ids) > 3:
            raise ValueError("Kling element_list supports at most 3 elements.")

        payload["element_list"] = [
            {"element_id": eid} for eid in processed_ids
        ]

    def _base_payload(self, request: VideoGenerateRequest) -> dict:
        payload = {
            "model_name": request.model,
            "prompt": request.prompt,
            "negative_prompt": request.negativePrompt or "",
            "duration": self._duration_for_request(request),
            "mode": self._quality_mode(request),
            "sound": self._sound(request),
            "callback_url": "",
            "external_task_id": "",
            "watermark_info": {
                "enabled": False
            },
        }
        cfg_scale = self._cfg_scale(request)
        if cfg_scale is not None:
            payload["cfg_scale"] = cfg_scale
        self._apply_multi_shot(request, payload)
        self._apply_camera_control(request, payload)
        self._apply_element_list(request, payload)
        return payload

    async def build_text2video(self, request: VideoGenerateRequest, project_path: str | None) -> dict:
        payload = self._base_payload(request)
        payload["aspect_ratio"] = request.aspectRatio or "16:9"
        return payload

    async def build_image2video(self, request: VideoGenerateRequest, project_path: str | None) -> dict:
        if not request.images:
            raise ValueError("Kling image-to-video requires a start image")
        if request.endImage and not self._supports_image_tail(request):
            raise ValueError("Kling image_tail requires pro mode for kling-v2-6.")
        payload = self._base_payload(request)
        payload["image"] = await self.resolve_image_for_kling(request.images[0], project_path)
        if request.endImage:
            payload["image_tail"] = await self.resolve_image_for_kling(request.endImage, project_path)
        return payload

    async def build_omni_video(self, request: VideoGenerateRequest, project_path: str | None) -> dict:
        if request.model != "kling-v3-omni":
            raise ValueError("Kling reference-video requires kling-v3-omni")

        payload = self._base_payload(request)
        payload["model_name"] = "kling-v3-omni"
        payload["aspect_ratio"] = request.aspectRatio or "16:9"

        image_list = []
        if request.videoMode == "image-to-video":
            if not request.images:
                raise ValueError("Kling omni image-to-video requires a start image")
            image_list.append({
                "image_url": await self.resolve_image_for_kling(request.images[0], project_path),
                "type": "first_frame",
            })
            if request.endImage:
                image_list.append({
                    "image_url": await self.resolve_image_for_kling(request.endImage, project_path),
                    "type": "end_frame",
                })
        else:
            image_list = [
                {"image_url": await self.resolve_image_for_kling(image_ref, project_path)}
                for image_ref in (request.images or [])[:7]
            ]

        if not image_list:
            raise ValueError("Kling reference-video requires at least one reference image")

        payload["image_list"] = image_list
        return payload
