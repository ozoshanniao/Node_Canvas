import re

from video_generation.providers.kling.payloads import EXTENDED_DURATIONS, KlingPayloadBuilder, parse_kling_duration
from video_generation.schemas import VideoGenerateRequest


OMNI_ALIAS_PATTERN = re.compile(r"@(image|element|video)_(\d+)")
OMNI_RESOLVED_ALIAS_PATTERN = re.compile(r"<<<(image|element|video)_(\d+)>>>")


class KlingOmniPayloadBuilder(KlingPayloadBuilder):
    def _kling_omni_params(self, request: VideoGenerateRequest) -> dict:
        kling_params = self._kling_custom_params(request)
        omni_params = kling_params.get("omniParams")
        return omni_params if isinstance(omni_params, dict) else {}

    def _validate_raw_prompt_aliases(self, prompt: str, known_aliases: set[str]) -> None:
        for match in OMNI_ALIAS_PATTERN.finditer(prompt):
            alias = f"{match.group(1)}_{match.group(2)}"
            if alias not in known_aliases:
                raise ValueError(f"Unknown Omni reference: @{alias}")

    def _resolved_prompt(self, omni_params: dict, known_aliases: set[str]) -> str:
        raw_prompt = str(omni_params.get("prompt") or "").strip()
        resolved_prompt = str(omni_params.get("resolvedPrompt") or "").strip()
        self._validate_raw_prompt_aliases(raw_prompt, known_aliases)

        prompt = resolved_prompt or raw_prompt
        if not prompt:
            return ""

        def replace_alias(match):
            alias = f"{match.group(1)}_{match.group(2)}"
            if alias not in known_aliases:
                raise ValueError(f"Unknown Omni reference: @{alias}")
            return f"<<<{alias}>>>"

        prompt = OMNI_ALIAS_PATTERN.sub(replace_alias, prompt)

        for match in OMNI_RESOLVED_ALIAS_PATTERN.finditer(prompt):
            alias = f"{match.group(1)}_{match.group(2)}"
            if alias not in known_aliases:
                raise ValueError(f"Unknown Omni reference: @{alias}")

        return prompt

    def _convert_prompt(self, prompt: str, known_aliases: set[str]) -> str:
        prompt = str(prompt or "").strip()
        self._validate_raw_prompt_aliases(prompt, known_aliases)

        def replace_alias(match):
            alias = f"{match.group(1)}_{match.group(2)}"
            if alias not in known_aliases:
                raise ValueError(f"Unknown Omni reference: @{alias}")
            return f"<<<{alias}>>>"

        return OMNI_ALIAS_PATTERN.sub(replace_alias, prompt)

    def _element_list(self, omni_params: dict) -> list[dict]:
        elements = omni_params.get("elements")
        if not isinstance(elements, list):
            return []
        if len(elements) > 3:
            raise ValueError("Kling element_list supports at most 3 elements.")

        element_list = []
        for item in elements:
            if not isinstance(item, dict):
                continue
            raw_id = item.get("elementId")
            if raw_id is None or str(raw_id).strip() == "":
                continue
            value = str(raw_id).strip()
            if not value.isdigit():
                raise ValueError("Invalid Kling element ID.")
            element_list.append({"element_id": int(value)})

        if len(element_list) > 3:
            raise ValueError("Kling element_list supports at most 3 elements.")
        return element_list

    async def _image_list(self, omni_params: dict, project_path: str | None) -> tuple[list[dict], bool]:
        images = omni_params.get("images")
        if not isinstance(images, list):
            return [], False

        first_frame_count = 0
        end_frame_count = 0
        image_list = []
        has_frame_role = False

        for item in images:
            if not isinstance(item, dict):
                continue
            image_url = str(item.get("url") or "").strip()
            if not image_url:
                continue
            role = str(item.get("role") or "reference").strip()
            resolved_image = await self.resolve_image_for_kling(image_url, project_path)
            entry = {"image_url": resolved_image}

            if role == "first_frame":
                first_frame_count += 1
                has_frame_role = True
                entry["type"] = "first_frame"
            elif role == "end_frame":
                end_frame_count += 1
                has_frame_role = True
                entry["type"] = "end_frame"
            elif role != "reference":
                raise ValueError("Invalid Kling Omni image role.")

            image_list.append(entry)

        if first_frame_count > 1:
            raise ValueError("Kling Omni supports at most one first_frame image.")
        if end_frame_count > 1:
            raise ValueError("Kling Omni supports at most one end_frame image.")
        if end_frame_count and not first_frame_count:
            raise ValueError("Kling Omni end_frame requires a first_frame image.")

        return image_list, has_frame_role

    def _duration_total(self, request: VideoGenerateRequest) -> int:
        raw = request.durationSeconds
        if raw is None:
            raw = request.duration
        try:
            return int(str(raw or "").strip().lower().replace("s", ""))
        except (TypeError, ValueError):
            return int(parse_kling_duration(request.duration or request.durationSeconds, allowed=EXTENDED_DURATIONS, default="5"))

    def _normalize_multi_prompt(self, omni_params: dict, known_aliases: set[str], expected_duration: int) -> list[dict]:
        multi_prompt = omni_params.get("multiPrompt")
        if not isinstance(multi_prompt, list) or not multi_prompt:
            raise ValueError("Omni multi-shot customize requires multi_prompt.")
        if len(multi_prompt) > 6:
            raise ValueError("Kling Omni multi_prompt supports 1 to 6 shots.")

        total_duration = 0
        normalized = []
        for item in multi_prompt:
            if not isinstance(item, dict):
                raise ValueError("Kling Omni multi_prompt prompt is required.")
            prompt = str(item.get("prompt") or "").strip()
            if not prompt:
                raise ValueError("Kling Omni multi_prompt prompt is required.")
            if len(prompt) > 512:
                raise ValueError("Kling Omni multi_prompt prompt must be at most 512 characters.")
            try:
                index = int(item.get("index", len(normalized) + 1))
                shot_duration = int(str(item.get("duration") or "").strip().lower().replace("s", ""))
            except (TypeError, ValueError):
                raise ValueError("Kling Omni multi_prompt duration must sum to total duration.") from None
            if shot_duration < 1:
                raise ValueError("Kling Omni multi_prompt duration must sum to total duration.")
            total_duration += shot_duration
            normalized.append({
                "index": index,
                "prompt": self._convert_prompt(prompt, known_aliases),
                "duration": str(shot_duration),
            })

        if total_duration != expected_duration:
            raise ValueError("Kling Omni multi_prompt duration must sum to total duration.")
        return normalized

    def _apply_omni_multi_shot(
        self,
        request: VideoGenerateRequest,
        payload: dict,
        omni_params: dict,
        known_aliases: set[str],
        resolved_prompt: str,
    ) -> None:
        shot_mode = str(omni_params.get("shotMode") or "single").strip().lower()
        if shot_mode not in {"single", "intelligence", "customize"}:
            raise ValueError("Invalid Kling Omni shot mode.")

        if shot_mode == "single":
            payload["multi_shot"] = False
            payload["prompt"] = resolved_prompt
            return

        if shot_mode == "intelligence":
            payload["multi_shot"] = True
            payload["shot_type"] = "intelligence"
            payload["prompt"] = resolved_prompt
            return

        expected_duration = self._duration_total(request)
        payload["multi_shot"] = True
        payload["shot_type"] = "customize"
        payload["prompt"] = ""
        payload["multi_prompt"] = self._normalize_multi_prompt(omni_params, known_aliases, expected_duration)

    async def build_omni_payload(self, request: VideoGenerateRequest, project_path: str | None) -> dict:
        if request.model != "kling-v3-omni":
            raise ValueError("Kling Omni payload requires kling-v3-omni.")

        kling_params = self._kling_custom_params(request)
        omni_params = kling_params.get("omniParams")
        if omni_params is None or not isinstance(omni_params, dict):
            raise ValueError("Kling Omni params are required.")
        videos = omni_params.get("videos")
        if isinstance(videos, list) and videos:
            raise ValueError("Kling Omni video references are not supported yet.")

        image_list, has_frame_role = await self._image_list(omni_params, project_path)
        element_list = self._element_list(omni_params)

        reference_total = len(image_list) + len(element_list)
        if reference_total > 7:
            raise ValueError("Kling Omni image and element references support at most 7 total items.")

        known_aliases = {
            *(f"image_{index + 1}" for index in range(len(image_list))),
            *(f"element_{index + 1}" for index in range(len(element_list))),
        }
        prompt = self._resolved_prompt(omni_params, known_aliases)
        shot_mode = str(omni_params.get("shotMode") or "single").strip().lower()
        if shot_mode != "customize" and not prompt:
            raise ValueError("Kling Omni prompt is required.")

        payload = {
            "model_name": "kling-v3-omni",
            "negative_prompt": request.negativePrompt or "",
            "mode": self._quality_mode(request),
            "sound": self._sound(request),
            "callback_url": "",
            "external_task_id": "",
            "watermark_info": {
                "enabled": False
            },
        }
        self._apply_omni_multi_shot(request, payload, omni_params, known_aliases, prompt)

        payload["duration"] = parse_kling_duration(
            request.duration or request.durationSeconds,
            allowed=EXTENDED_DURATIONS,
            default="5",
        )
        if not has_frame_role:
            payload["aspect_ratio"] = request.aspectRatio or "16:9"

        if image_list:
            payload["image_list"] = image_list
        if element_list:
            payload["element_list"] = element_list

        return payload
