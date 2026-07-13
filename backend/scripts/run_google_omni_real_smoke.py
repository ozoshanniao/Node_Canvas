"""Explicit, billable Gemini Omni video smoke entry point.

Only Python's standard library is imported until every coarse safety gate has
passed. The module is not a unittest entry point and is never imported by the
application service.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import time
import zlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Callable, Mapping, Protocol, Sequence
from urllib.parse import urlparse


ENABLE_ENV = "NODE_CANVAS_RUN_GOOGLE_OMNI_SMOKE"
PROVIDER = "google_omni"
MODEL = "gemini-omni-flash-preview"
MAX_CREATE_ATTEMPTS = 1
MAX_QUERY_ATTEMPTS = 0
TEMP_PROJECT_PREFIX = "node-canvas-google-omni-smoke-"
TEMP_CLEANUP_ATTEMPTS = 3
TEMP_CLEANUP_DELAY_SECONDS = 0.05
DURATION = "5s"
DURATION_GUIDANCE = "Generate a single video approximately 5 seconds long."
CASES = frozenset({"t2v", "i2v", "reference", "uri"})
FIXED_PROMPTS = {
    "t2v": "A matte blue paper circle rests on a plain white table, static camera.",
    "i2v": "<FIRST_FRAME> Gently move the paper circle while keeping a static camera.",
    "reference": "Use <IMAGE_REF_0> and <IMAGE_REF_1> as simple color references, static camera.",
    "uri": "A matte blue paper circle rests on a plain white table, static camera.",
}
TASK_BY_CASE = {
    "t2v": "text_to_video",
    "i2v": "image_to_video",
    "reference": "reference_to_video",
    "uri": "text_to_video",
}
MODE_BY_CASE = {
    "t2v": "text-to-video",
    "i2v": "image-to-video",
    "reference": "reference-video",
    "uri": "text-to-video",
}


class GateError(ValueError):
    """Non-sensitive refusal raised before any provider import or call."""


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise GateError(f"invalid command line: {message}")


@dataclass(frozen=True)
class SmokePlan:
    case: str
    mode: str
    task: str
    delivery: str
    aspect_ratio: str = "16:9"
    duration: str = DURATION


@dataclass(frozen=True)
class SmokeResult:
    case: str
    status: str
    artifact_ready: bool
    artifact_bytes: int = 0
    ftyp_valid: bool = False
    create_calls: int = 0
    query_calls: int = 0
    uri_scheme: str = "none"
    error_summary: str | None = None
    error_category: str = "none"
    http_status_class: str = "none"
    exception_type: str = "none"
    response_received: bool = False
    interaction_completed: bool = False
    video_output_present: bool = False
    video_bytes_present: bool = False
    materialization_entered: bool = False
    failure_task_persistence_check: bool | None = None
    project_resolution_completed: bool = False
    client_initialization_completed: bool = False
    sdk_create_entered: bool = False
    sdk_request_serialized: bool = False
    transport_invocation_started: bool = False
    provider_response_received: bool = False
    http_response_received: bool = False
    failure_stage: str = "unknown"
    project_configuration_state: str = "unresolved"
    project_configuration_source: str = "unknown"


class SmokeRuntime(Protocol):
    def validate_plan(self, case: str) -> SmokePlan: ...

    def preflight(self, plan: SmokePlan) -> tuple[bool, bool, bool]: ...

    def runtime_configuration_preflight(self) -> tuple[bool, str, str]: ...

    def run(self, project_path: str, plan: SmokePlan) -> SmokeResult: ...


def _parser() -> SafeArgumentParser:
    parser = SafeArgumentParser(
        description="Run one explicitly authorized Gemini Omni billable smoke case."
    )
    parser.add_argument("--run-real-smoke", action="store_true")
    parser.add_argument("--accept-billable-provider-calls", action="store_true")
    parser.add_argument("--accept-uri-delivery-call", action="store_true")
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--case", choices=sorted(CASES))
    return parser


def _coarse_gates(args: argparse.Namespace, environ: Mapping[str, str]) -> str:
    if args.preflight:
        raise GateError("--preflight cannot be combined with real smoke execution")
    if not args.run_real_smoke:
        raise GateError("refusing real smoke: --run-real-smoke is required")
    if environ.get(ENABLE_ENV) != "1":
        raise GateError(f"refusing real smoke: {ENABLE_ENV}=1 is required")
    if not args.accept_billable_provider_calls:
        raise GateError("refusing real smoke: --accept-billable-provider-calls is required")
    if args.case not in CASES:
        raise GateError("exactly one supported --case is required")
    if args.case == "uri" and not args.accept_uri_delivery_call:
        raise GateError("refusing URI smoke: --accept-uri-delivery-call is required")
    if args.case != "uri" and args.accept_uri_delivery_call:
        raise GateError("--accept-uri-delivery-call is only valid with --case uri")
    return args.case



def _is_uri_delivery_attempt(args: argparse.Namespace) -> bool:
    return bool(args.accept_uri_delivery_call or args.case == "uri")


def _emit_uri_delivery_refusal(output: Callable[[str], None]) -> None:
    output("status: refused")
    output("errorCategory: unsupported_delivery")
    output("failureStage: request_validation")
    output("create count: 0")
    output("query count: 0")
    output("sdkCreateEntered: false")
    output("sdkRequestSerialized: false")
    output("transportInvocationStarted: false")
    output("providerResponseReceived: false")
    output("httpResponseReceived: false")
    output("network calls: 0")
    output("temporary project created: no")

def _preflight_gates(args: argparse.Namespace) -> str:
    if args.run_real_smoke or args.accept_billable_provider_calls or args.accept_uri_delivery_call:
        raise GateError("preflight cannot be combined with real smoke authorization flags")
    if args.case not in {None, "t2v"}:
        raise GateError("preflight only supports --case t2v")
    return "t2v"


def _bootstrap_backend_import_path() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    backend_path = str(backend_root)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)



def _bootstrap_backend_environment() -> None:
    # Reuse backend/main.py's existing python-dotenv bootstrap after the
    # non-preflight real-smoke gates have passed. This imports no provider,
    # creates no client, and does not inspect or report loaded values.
    from dotenv import load_dotenv

    dotenv_path = Path.cwd() / ".env"
    if dotenv_path.is_file():
        load_dotenv(dotenv_path=dotenv_path, override=False)
    else:
        load_dotenv(override=False)

def _external_temp_root() -> Path:
    temp_root = Path(tempfile.gettempdir()).resolve()
    repository_root = Path(__file__).resolve().parents[2]
    backend_root = repository_root / "backend"
    if temp_root in {repository_root, backend_root} or repository_root in temp_root.parents:
        raise GateError("refusing smoke: system temporary directory is inside the repository")
    return temp_root


def _cleanup_owned_temp_project(
    project_path: Path,
    temp_root: Path,
    *,
    attempts: int = TEMP_CLEANUP_ATTEMPTS,
    delay_seconds: float = TEMP_CLEANUP_DELAY_SECONDS,
) -> bool:
    try:
        owned_path = project_path.resolve(strict=False)
        owned_root = temp_root.resolve(strict=False)
    except OSError:
        return False
    if (
        owned_path.parent != owned_root
        or not owned_path.name.startswith(TEMP_PROJECT_PREFIX)
        or owned_path == owned_root
    ):
        return False

    bounded_attempts = max(1, min(int(attempts), TEMP_CLEANUP_ATTEMPTS))
    for attempt in range(bounded_attempts):
        try:
            if owned_path.exists():
                shutil.rmtree(owned_path)
        except OSError:
            pass
        if not owned_path.exists():
            return True
        if attempt + 1 < bounded_attempts:
            time.sleep(max(0.0, delay_seconds))
    return False


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def _solid_png(red: int, green: int, blue: int, size: int = 256) -> bytes:
    row = b"\x00" + bytes((red, green, blue)) * size
    raw = row * size
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(raw, 9))
        + _png_chunk(b"IEND", b"")
    )


def _prepare_images(project_path: str, case: str) -> list[str]:
    if case not in {"i2v", "reference"}:
        return []
    input_dir = Path(project_path) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    colors = [(36, 96, 180)] if case == "i2v" else [(36, 96, 180), (220, 150, 40)]
    relative_paths = []
    for index, color in enumerate(colors):
        relative = f"input/omni-smoke-{index}.png"
        (Path(project_path) / relative).write_bytes(_solid_png(*color))
        relative_paths.append(relative)
    return relative_paths


def _safe_relative_video(project_path: str, value: object) -> Path | None:
    if not isinstance(value, str):
        return None
    raw = value.strip().replace("\\", "/")
    if not raw or re.match(r"^[A-Za-z]:", raw) or raw.startswith(("/", "//")):
        return None
    parsed = urlparse(raw)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        return None
    pure = PurePosixPath(parsed.path)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
        return None
    if tuple(pure.parts[:2]) != ("generation", "videos"):
        return None
    project_root = Path(project_path).resolve()
    target = (project_root / Path(*pure.parts)).resolve()
    if project_root not in target.parents or not target.is_file():
        return None
    return target


def _classify_uri(uri: str) -> str:
    value = str(uri or "").strip()
    lowered = value.lower()
    parsed = urlparse(value)
    if parsed.scheme == "https":
        return "https"
    if parsed.scheme == "gs":
        return "gs"
    if parsed.scheme in {"file", "files"} or lowered.startswith(("files/", "files:")):
        return "files"
    return parsed.scheme.lower() or "other"


def _first_video_uri(interaction: object) -> str:
    videos = [getattr(interaction, "output_video", None)]
    for step in reversed(list(getattr(interaction, "steps", None) or [])):
        if getattr(step, "type", None) == "model_output":
            videos.extend(reversed(list(getattr(step, "content", None) or [])))
    for video in videos:
        if getattr(video, "type", None) == "video" or video is videos[0]:
            uri = str(getattr(video, "uri", "") or "").strip()
            if uri:
                return uri
    return ""


def _validate_request_contract(request: object, plan: SmokePlan) -> None:
    if plan.duration != DURATION:
        raise GateError("runtime request duration plan contract mismatch")
    if getattr(request, "model", None) != MODEL:
        raise GateError("runtime request model contract mismatch")
    if getattr(request, "background", None) is not False:
        raise GateError("runtime request background contract mismatch")
    if getattr(request, "store", None) is not False:
        raise GateError("runtime request store contract mismatch")
    if getattr(request, "stream", None) is not False:
        raise GateError("runtime request stream contract mismatch")
    if getattr(request, "previous_interaction_id", None) is not None:
        raise GateError("runtime request must not contain previous_interaction_id")
    generation = getattr(request, "generation_config", None)
    video_config = getattr(generation, "video_config", None)
    if getattr(video_config, "task", None) != plan.task:
        raise GateError("runtime request video task contract mismatch")
    response_format = getattr(request, "response_format", None)
    if isinstance(response_format, list):
        response_format = response_format[0] if len(response_format) == 1 else None
    if getattr(response_format, "type", None) != "video":
        raise GateError("runtime response format type mismatch")
    if getattr(response_format, "delivery", None) != plan.delivery:
        raise GateError("runtime response delivery contract mismatch")
    if getattr(response_format, "aspect_ratio", None) != plan.aspect_ratio:
        raise GateError("runtime response aspect ratio contract mismatch")
    if getattr(response_format, "duration", None) is not None or getattr(response_format, "gcs_uri", None) is not None:
        raise GateError("runtime response format contains prohibited fields")
    content = list(getattr(request, "input", None) or [])
    texts = " ".join(str(getattr(item, "text", "") or "") for item in content)
    if texts.count(DURATION_GUIDANCE) != 1:
        raise GateError("runtime request duration guidance contract mismatch")
    image_count = sum(1 for item in content if getattr(item, "type", None) == "image")
    expected_images = {"t2v": 0, "i2v": 1, "reference": 2, "uri": 0}[plan.case]
    if image_count != expected_images:
        raise GateError("runtime request image count contract mismatch")
    if plan.case == "i2v" and "<FIRST_FRAME>" not in texts:
        raise GateError("runtime request lacks FIRST_FRAME role")
    if plan.case == "reference" and not all(token in texts for token in ("<IMAGE_REF_0>", "<IMAGE_REF_1>")):
        raise GateError("runtime request lacks image reference roles")
    serialized = str(request.model_dump(exclude_none=True))
    forbidden = (
        "resolution", "seed", "negativePrompt", "temperature", "top_p", "customParams",
        "image:lastFrame", "<END_FRAME>", "<LAST_FRAME>",
    )
    if any(marker in serialized for marker in forbidden):
        raise GateError("runtime request contains prohibited fields or role tokens")


def _validate_persistence(project_path: str, task: object) -> tuple[Path, int]:
    task_file = Path(project_path) / "tasks" / "video_tasks.json"
    records = json.loads(task_file.read_text(encoding="utf-8"))
    task_id = str(getattr(task, "id", "") or "")
    record = records.get(task_id)
    if not isinstance(record, dict):
        raise GateError("persisted Task v2 record is missing")
    if "providerTaskId" in record:
        raise GateError("provider task or Interaction ID entered Task v2 persistence")
    outputs = record.get("outputs")
    if not isinstance(outputs, dict) or set(outputs) != {"video"}:
        raise GateError("persisted Task v2 outputs are not canonical")
    video = outputs.get("video")
    if not isinstance(video, dict) or set(video) != {"relativePath"}:
        raise GateError("persisted video output contains non-relative fields")
    artifact = _safe_relative_video(project_path, video.get("relativePath"))
    if artifact is None:
        raise GateError("safe local video artifact is unavailable")
    serialized = json.dumps(record, ensure_ascii=False).lower()
    forbidden = ("http://", "https://", "gs://", "files://", "rawresponse", "raw_response", "authorization", "bearer", "token=")
    if any(marker in serialized for marker in forbidden):
        raise GateError("persisted Task v2 contains prohibited remote or sensitive data")
    if re.search(r"[a-z]:[\\/]", serialized) or "\\\\" in serialized:
        raise GateError("persisted Task v2 contains an absolute or UNC path")
    return artifact, artifact.stat().st_size


def _validate_failure_persistence(project_path: str, task: object) -> bool:
    try:
        task_file = Path(project_path) / "tasks" / "video_tasks.json"
        records = json.loads(task_file.read_text(encoding="utf-8"))
        record = records.get(str(getattr(task, "id", "") or ""))
        if not isinstance(record, dict):
            return False
        if record.get("status") != "error" or record.get("outputs") != {}:
            return False
        if record.get("message") != "Gemini Omni video generation failed.":
            return False
        if record.get("error") != "Gemini Omni video generation failed.":
            return False
        if record.get("requestSnapshot") not in (None, {}):
            return False
        forbidden_keys = {
            "providerTaskId", "raw_response", "rawResponse", "interactionId",
            "interaction_id", "url", "uri", "absolutePath", "exception",
            "errorCategory", "httpStatusClass", "exceptionType",
        }
        if any(key in record for key in forbidden_keys):
            return False
        serialized = json.dumps(record, ensure_ascii=False)
        lowered = serialized.lower()
        forbidden_text = (
            "http://", "https://", "gs://", "files://", "authorization",
            "bearer", "token=", "api_key", "api key", "secret=",
            "interaction id", "interaction_id", "providertaskid",
            "raw_response", "rawresponse", "traceback",
        )
        if any(marker in lowered for marker in forbidden_text):
            return False
        if re.search(r"[A-Za-z]:[\\/]", serialized) or "\\\\" in serialized:
            return False
        return True
    except Exception:
        return False


def _load_runtime() -> SmokeRuntime:
    # Delayed imports: no SDK, provider, service, or credential resolution can
    # occur until all coarse authorization gates have passed.
    import asyncio

    from google.genai import interactions

    from video_generation.adapters.google_omni import GoogleOmniVideoAdapter
    from video_generation.adapters.registry import register_video_adapter
    from video_generation.providers.google_omni_provider import (
        GoogleOmniProvider,
        VideoCreateDiagnostics,
        run_blocked_transport_contract,
    )
    from video_generation.capabilities import list_video_model_capabilities, validate_model_capability
    from video_generation.schemas import VideoGenerateRequest
    from video_generation.service import VideoGenerationService
    from video_generation.tasks import task_api_data

    class RealSmokeRuntime:
        @staticmethod
        def _capability():
            matches = [
                capability
                for capability in list_video_model_capabilities()
                if capability.get("provider") == PROVIDER and capability.get("model") == MODEL
            ]
            if len(matches) != 1:
                raise GateError("Google Omni capability is not present exactly once")
            validate_model_capability(matches[0])
            return matches[0]

        def validate_plan(self, case: str) -> SmokePlan:
            capability = self._capability()
            expected_modes = {"text-to-video", "image-to-video", "reference-video"}
            if set(capability.get("taskTypes") or []) != expected_modes:
                raise GateError("Google Omni capability modes do not match the smoke contract")
            required_parameters = {"videoMode", "aspectRatio", "duration"}
            if set(capability.get("parameters") or {}) != required_parameters:
                raise GateError("Google Omni capability exposes prohibited parameters")
            if capability.get("quickParams") != ["videoMode", "aspectRatio", "duration"]:
                raise GateError("Google Omni capability quick parameters do not match the smoke contract")
            return SmokePlan(
                case=case,
                mode=MODE_BY_CASE[case],
                task=TASK_BY_CASE[case],
                delivery="uri" if case == "uri" else "inline",
                duration=DURATION,
            )

        def preflight(self, plan: SmokePlan) -> tuple[bool, bool, bool]:
            if plan.duration != DURATION:
                raise GateError("preflight plan contract mismatch")

            class ForbiddenProvider:
                def create_interaction(self, _request):
                    raise GateError("preflight must not call the provider")

            image_count = {"t2v": 0, "i2v": 1, "reference": 2, "uri": 0}[plan.case]
            image_data = "data:image/png;base64," + base64.b64encode(
                _solid_png(36, 96, 180)
            ).decode("ascii")
            request = VideoGenerateRequest(
                projectPath=".",
                provider=PROVIDER,
                model=MODEL,
                videoMode=plan.mode,
                prompt=FIXED_PROMPTS[plan.case],
                aspectRatio=plan.aspect_ratio,
                duration=plan.duration,
                images=[image_data] * image_count,
            )
            adapter = GoogleOmniVideoAdapter(ForbiddenProvider())
            internal_request = adapter.create_request_from_generate_request(request)
            if (
                internal_request.provider != PROVIDER
                or internal_request.model != MODEL
                or internal_request.task_type != plan.mode
                or internal_request.params.get("aspectRatio") != plan.aspect_ratio
                or internal_request.params.get("duration") != plan.duration
            ):
                raise GateError("preflight internal request contract mismatch")
            payload = adapter.build_create_payload(internal_request, self._capability())
            if plan.delivery == "uri":
                payload = payload.model_copy(update={
                    "response_format": interactions.VideoResponseFormat(
                        type="video",
                        aspect_ratio=plan.aspect_ratio,
                        delivery="uri",
                    )
                })
            _validate_request_contract(payload, plan)
            text = " ".join(
                str(getattr(item, "text", "") or "")
                for item in list(getattr(payload, "input", None) or [])
            )
            guidance_valid = text.count(DURATION_GUIDANCE) == 1
            response_format = getattr(payload, "response_format", None)
            generation = getattr(payload, "generation_config", None)
            video_config = getattr(generation, "video_config", None)
            typed_duration_absent = (
                getattr(response_format, "duration", None) is None
                and getattr(video_config, "duration", None) is None
            )
            if not guidance_valid or not typed_duration_absent:
                raise GateError("preflight duration contract mismatch")
            self.preflight_payload = payload
            return True, guidance_valid, typed_duration_absent

        def runtime_configuration_preflight(self) -> tuple[bool, str, str]:
            state = GoogleOmniProvider().runtime_project_configuration()
            return state.passed, state.state, state.source

        def sdk_contract_preflight(self) -> dict[str, bool]:
            return run_blocked_transport_contract(self.preflight_payload)

        def run(self, project_path: str, plan: SmokePlan) -> SmokeResult:
            async def execute() -> SmokeResult:
                images = _prepare_images(project_path, plan.case)
                service = VideoGenerationService()
                production_provider = service.providers[PROVIDER]
                counters = {"create": 0, "query": 0}
                observed_uri_scheme = "none"

                class ObservedProvider:
                    @property
                    def last_diagnostics(self):
                        return getattr(production_provider, "last_diagnostics", None)

                    def create_interaction(self, request):
                        nonlocal observed_uri_scheme
                        counters["create"] += 1
                        if counters["create"] > MAX_CREATE_ATTEMPTS:
                            raise GateError("more than one provider create call was attempted")
                        _validate_request_contract(request, plan)
                        interaction = production_provider.create_interaction(request)
                        uri = _first_video_uri(interaction)
                        if uri:
                            observed_uri_scheme = _classify_uri(uri)
                        return interaction

                class SmokeAdapter(GoogleOmniVideoAdapter):
                    def build_create_payload(self, request, capability):
                        payload = super().build_create_payload(request, capability)
                        if plan.delivery == "uri":
                            payload = payload.model_copy(update={
                                "response_format": interactions.VideoResponseFormat(
                                    type="video",
                                    aspect_ratio=plan.aspect_ratio,
                                    delivery="uri",
                                )
                            })
                        return payload

                register_video_adapter(SmokeAdapter(ObservedProvider()))

                async def forbidden_query(*_args, **_kwargs):
                    counters["query"] += 1
                    raise GateError("Google Omni smoke must not query")

                service.query_task = forbidden_query
                request = VideoGenerateRequest(
                    projectPath=project_path,
                    provider=PROVIDER,
                    model=MODEL,
                    videoMode=plan.mode,
                    prompt=FIXED_PROMPTS[plan.case],
                    aspectRatio=plan.aspect_ratio,
                    duration=plan.duration,
                    images=images,
                )
                task = await service.create_task(project_path, request)
                diagnostics = service.last_create_diagnostics or VideoCreateDiagnostics(
                    error_category="unknown"
                )
                if task.status != "success":
                    return SmokeResult(
                        plan.case,
                        task.status,
                        False,
                        create_calls=counters["create"],
                        query_calls=counters["query"],
                        uri_scheme=diagnostics.uri_scheme_class or observed_uri_scheme,
                        error_summary="provider result was not localized",
                        error_category=diagnostics.error_category or "unknown",
                        http_status_class=diagnostics.http_status_class,
                        exception_type=diagnostics.exception_type,
                        response_received=diagnostics.response_received,
                        interaction_completed=diagnostics.interaction_completed,
                        video_output_present=diagnostics.video_output_present,
                        video_bytes_present=diagnostics.video_bytes_present,
                        materialization_entered=diagnostics.materialization_entered,
                        failure_task_persistence_check=_validate_failure_persistence(project_path, task),
                        project_resolution_completed=diagnostics.project_resolution_completed,
                        client_initialization_completed=diagnostics.client_initialization_completed,
                        sdk_create_entered=diagnostics.sdk_create_entered,
                        sdk_request_serialized=diagnostics.sdk_request_serialized,
                        transport_invocation_started=diagnostics.transport_invocation_started,
                        provider_response_received=diagnostics.provider_response_received,
                        http_response_received=diagnostics.http_response_received,
                        failure_stage=diagnostics.failure_stage,
                        project_configuration_state=diagnostics.project_configuration_state,
                        project_configuration_source=diagnostics.project_configuration_source,
                    )
                artifact, artifact_bytes = _validate_persistence(project_path, task)
                data = artifact.read_bytes()
                ftyp_valid = b"ftyp" in data[:64]
                api_data = task_api_data(task)
                if "providerTaskId" in api_data:
                    raise GateError("provider task or Interaction ID entered Task v2 API output")
                if not ftyp_valid or artifact_bytes <= 0:
                    raise GateError("localized artifact is not a valid non-empty MP4")
                if counters != {"create": 1, "query": 0}:
                    raise GateError("provider call count contract was violated")
                return SmokeResult(
                    plan.case,
                    "success",
                    True,
                    artifact_bytes=artifact_bytes,
                    ftyp_valid=True,
                    create_calls=1,
                    query_calls=0,
                    uri_scheme=observed_uri_scheme,
                    error_category=diagnostics.error_category or "none",
                    http_status_class=diagnostics.http_status_class,
                    exception_type=diagnostics.exception_type,
                    response_received=diagnostics.response_received,
                    interaction_completed=diagnostics.interaction_completed,
                    video_output_present=diagnostics.video_output_present,
                    video_bytes_present=diagnostics.video_bytes_present,
                    materialization_entered=diagnostics.materialization_entered,
                    project_resolution_completed=diagnostics.project_resolution_completed,
                    client_initialization_completed=diagnostics.client_initialization_completed,
                    sdk_create_entered=diagnostics.sdk_create_entered,
                    sdk_request_serialized=diagnostics.sdk_request_serialized,
                    transport_invocation_started=diagnostics.transport_invocation_started,
                    provider_response_received=diagnostics.provider_response_received,
                    http_response_received=diagnostics.http_response_received,
                    failure_stage=diagnostics.failure_stage,
                    project_configuration_state=diagnostics.project_configuration_state,
                    project_configuration_source=diagnostics.project_configuration_source,
                )

            return asyncio.run(execute())

    return RealSmokeRuntime()


def _emit_preflight_summary(
    output: Callable[[str], None],
    *,
    passed: bool,
    project_resolution_contract: bool,
    client_construction_contract: bool,
    request_validation: bool,
    request_serialization: bool,
    mock_transport_reached: bool,
) -> None:
    def status(value: bool) -> str:
        return "PASS" if value else "FAIL"

    output(f"SDK contract preflight: {status(passed)}")
    output(f"project resolution contract: {status(project_resolution_contract)}")
    output(f"client construction contract: {status(client_construction_contract)}")
    output(f"request validation: {status(request_validation)}")
    output(f"request serialization: {status(request_serialization)}")
    output(f"mock transport reached: {str(mock_transport_reached).lower()}")
    output("network calls: 0")
    output("credential reads: 0")
    output("temporary project created: no")


def _emit_runtime_configuration_summary(
    output: Callable[[str], None],
    *,
    passed: bool,
    state: str,
    source: str,
) -> None:
    output(f"Runtime configuration preflight: {'PASS' if passed else 'FAIL'}")
    output(f"project resolution: {'PASS' if passed else 'FAIL'}")
    output(f"projectConfigurationState: {state}")
    output(f"projectConfigurationSource: {source}")
    output("client created: no")
    output("network calls: 0")
    output("credential reads: 0")
    output("temporary project created: no")


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    runtime_factory: Callable[[], SmokeRuntime] | None = None,
    output: Callable[[str], None] = print,
) -> int:
    sdk_contract_state = {
        "project_resolution_contract": False,
        "client_construction_contract": False,
        "request_validation": False,
        "request_serialization": False,
        "mock_transport_reached": False,
    }
    runtime_configuration_state = {
        "passed": False,
        "state": "unresolved",
        "source": "unknown",
    }
    try:
        args = _parser().parse_args(argv)
        if _is_uri_delivery_attempt(args):
            _emit_uri_delivery_refusal(output)
            return 2
        if args.preflight:
            case = _preflight_gates(args)
        else:
            case = _coarse_gates(args, os.environ if environ is None else environ)
        _bootstrap_backend_import_path()
        _bootstrap_backend_environment()
        runtime = (runtime_factory or _load_runtime)()
        plan = runtime.validate_plan(case)
        runtime.preflight(plan)

        runtime_configuration_runner = getattr(runtime, "runtime_configuration_preflight", None)
        if not callable(runtime_configuration_runner):
            raise GateError("runtime configuration preflight is unavailable")
        configured, configuration_state, configuration_source = runtime_configuration_runner()
        if configuration_state not in {"configured", "missing", "blank", "invalid", "unresolved"}:
            configuration_state = "unresolved"
            configured = False
        if configuration_source not in {"configured", "absent", "unknown"}:
            configuration_source = "unknown"
            configured = False
        runtime_configuration_state.update(
            passed=bool(configured),
            state=configuration_state,
            source=configuration_source,
        )

        if args.preflight:
            contract_runner = getattr(runtime, "sdk_contract_preflight", None)
            if callable(contract_runner):
                sdk_contract_state.update(contract_runner())
            contract_passed = all(sdk_contract_state.values())
            _emit_runtime_configuration_summary(output, **runtime_configuration_state)
            _emit_preflight_summary(output, passed=contract_passed, **sdk_contract_state)
            return 0 if runtime_configuration_state["passed"] and contract_passed else 1

        if not runtime_configuration_state["passed"]:
            _emit_runtime_configuration_summary(output, **runtime_configuration_state)
            output("Temporary project cleanup: N/A")
            return 2

        temp_root = _external_temp_root()
        project_path = Path(tempfile.mkdtemp(prefix=TEMP_PROJECT_PREFIX, dir=temp_root))
        result = None
        run_error = None
        try:
            with open(os.devnull, "w", encoding="utf-8") as discarded, contextlib.redirect_stdout(
                discarded
            ), contextlib.redirect_stderr(discarded):
                result = runtime.run(str(project_path), plan)
        except BaseException as exc:
            run_error = exc
        cleanup_passed = _cleanup_owned_temp_project(project_path, temp_root)
        output(f"Temporary project cleanup: {'PASS' if cleanup_passed else 'FAIL'}")
        if not cleanup_passed:
            return 1
        if run_error is not None:
            raise run_error
        if result is None:
            raise RuntimeError("smoke runtime returned no result")

        passed = (
            result.status == "success"
            and result.artifact_ready
            and result.artifact_bytes > 0
            and result.ftyp_valid
        )
        persistence_check = (
            "PASS" if result.failure_task_persistence_check is True
            else "FAIL" if result.failure_task_persistence_check is False
            else "N/A"
        )
        output(f"Smoke A result: {'PASS' if passed else 'FAIL'}")
        output(f"status: {result.status}")
        output(f"create count: {result.create_calls}")
        output(f"query count: {result.query_calls}")
        output(f"artifactReady: {str(result.artifact_ready).lower()}")
        output(f"artifactBytes: {result.artifact_bytes}")
        output(f"ftypValid: {str(result.ftyp_valid).lower()}")
        output(f"errorCategory: {result.error_category}")
        output(f"httpStatusClass: {result.http_status_class}")
        output(f"exceptionType: {result.exception_type}")
        output(f"responseReceived: {str(result.response_received).lower()}")
        output(f"interactionCompleted: {str(result.interaction_completed).lower()}")
        output(f"videoOutputPresent: {str(result.video_output_present).lower()}")
        output(f"videoBytesPresent: {str(result.video_bytes_present).lower()}")
        output(f"uriSchemeClass: {result.uri_scheme}")
        output(f"materializationEntered: {str(result.materialization_entered).lower()}")
        output(f"projectResolutionCompleted: {str(result.project_resolution_completed).lower()}")
        output(f"projectConfigurationState: {result.project_configuration_state}")
        output(f"projectConfigurationSource: {result.project_configuration_source}")
        output(f"clientInitializationCompleted: {str(result.client_initialization_completed).lower()}")
        output(f"sdkCreateEntered: {str(result.sdk_create_entered).lower()}")
        output(f"sdkRequestSerialized: {str(result.sdk_request_serialized).lower()}")
        output(f"transportInvocationStarted: {str(result.transport_invocation_started).lower()}")
        output(f"providerResponseReceived: {str(result.provider_response_received).lower()}")
        output(f"httpResponseReceived: {str(result.http_response_received).lower()}")
        output(f"failureStage: {result.failure_stage}")
        output(f"failureTaskPersistenceCheck: {persistence_check}")
        return 0 if passed else 1
    except GateError as exc:
        if "args" in locals() and getattr(args, "preflight", False):
            _emit_runtime_configuration_summary(output, **runtime_configuration_state)
            _emit_preflight_summary(output, passed=False, **sdk_contract_state)
            return 2
        output(f"GOOGLE OMNI REAL SMOKE REFUSED: {exc}")
        return 2
    except Exception as exc:
        if "args" in locals() and getattr(args, "preflight", False):
            _emit_runtime_configuration_summary(output, **runtime_configuration_state)
            _emit_preflight_summary(output, passed=False, **sdk_contract_state)
            return 1
        output(f"GOOGLE OMNI REAL SMOKE FAILED: runtime error ({type(exc).__name__})")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
