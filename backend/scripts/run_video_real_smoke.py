"""Explicit, billable real-provider video smoke entry point.

This module intentionally imports only the Python standard library until every
coarse safety gate has passed. It is not a unittest/pytest entry point.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import re
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Mapping, Protocol, Sequence


ENABLE_ENV = "NODE_CANVAS_RUN_VIDEO_SMOKE"
ALLOWED_PROVIDERS = frozenset({"google", "yunwu", "kling", "yunwu-kling", "kie"})
MAX_CREATE_ATTEMPTS = 1
DEFAULT_POLL_MAX = 30
MAX_POLL_MAX = 30
DEFAULT_POLL_INTERVAL_SECONDS = 10.0
MIN_POLL_INTERVAL_SECONDS = 10.0
FIXED_PROMPT = "A single blue paper circle rests on a plain white table, static camera."
TERMINAL_STATUSES = frozenset({"success", "error", "cancelled", "canceled", "interrupted"})


class GateError(ValueError):
    """A non-sensitive smoke safety-gate failure."""


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise GateError(f"invalid command line: {message}")


@dataclass(frozen=True)
class SmokePlan:
    provider: str
    model: str
    duration: str
    duration_seconds: int
    resolution: str
    aspect_ratio: str | None


@dataclass(frozen=True)
class SmokeResult:
    status: str
    artifact_ready: bool
    error_summary: str | None = None


class SmokeRuntime(Protocol):
    def validate_plan(self, provider: str, model: str) -> SmokePlan: ...

    def run(
        self,
        project_path: str,
        plan: SmokePlan,
        *,
        poll_max: int,
        poll_interval_seconds: float,
    ) -> SmokeResult: ...


def _parser() -> SafeArgumentParser:
    parser = SafeArgumentParser(
        description="Run one explicitly authorized, billable real-provider video smoke.",
        add_help=True,
    )
    parser.add_argument("--run-real-smoke", action="store_true")
    parser.add_argument("--accept-billable-provider-calls", action="store_true")
    parser.add_argument("--provider", action="append")
    parser.add_argument("--model", action="append")
    parser.add_argument("--poll-max", type=int, default=DEFAULT_POLL_MAX)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS)
    return parser


def _one_value(values: list[str] | None, label: str) -> str:
    if not values or len(values) != 1 or not values[0].strip():
        raise GateError(f"exactly one --{label} is required")
    return values[0].strip()


def _coarse_gates(args: argparse.Namespace, environ: Mapping[str, str]) -> tuple[str, str]:
    if not args.run_real_smoke:
        raise GateError("refusing real smoke: --run-real-smoke is required")
    if environ.get(ENABLE_ENV) != "1":
        raise GateError(f"refusing real smoke: {ENABLE_ENV}=1 is required")
    if not args.accept_billable_provider_calls:
        raise GateError("refusing real smoke: --accept-billable-provider-calls is required")

    provider = _one_value(args.provider, "provider")
    model = _one_value(args.model, "model")
    if provider not in ALLOWED_PROVIDERS:
        raise GateError("selected provider is not in the R1 real-smoke allowlist")
    if "omni" in model.lower():
        raise GateError("Kling Omni is not allowed by the R1 real-smoke harness")
    if args.poll_max < 1 or args.poll_max > MAX_POLL_MAX:
        raise GateError(f"--poll-max must be between 1 and {MAX_POLL_MAX}")
    if args.poll_interval < MIN_POLL_INTERVAL_SECONDS:
        raise GateError(f"--poll-interval must be at least {MIN_POLL_INTERVAL_SECONDS:g} seconds")
    return provider, model


def _numeric_option(value: Any, suffix: str) -> int | None:
    match = re.fullmatch(rf"(\d+){re.escape(suffix)}", str(value or "").strip(), re.IGNORECASE)
    return int(match.group(1)) if match else None


def _lowest_option(parameter: Mapping[str, Any], suffix: str, label: str) -> tuple[str, int]:
    candidates = []
    for option in parameter.get("options") or []:
        number = _numeric_option(option, suffix)
        if number is not None:
            candidates.append((number, str(option)))
    if not candidates:
        raise GateError(f"selected model has no source-validated {label} options")
    number, option = min(candidates)
    return option, number


def _validate_capability(provider: str, model: str, capability: Mapping[str, Any]) -> SmokePlan:
    if capability.get("provider") != provider or capability.get("model") != model:
        raise GateError("selected provider/model is not present in the current capability registry")
    if capability.get("family") == "seedance" or "seedance" in model.lower():
        raise GateError("Seedance models are reserved for a later isolated smoke design")
    if "text-to-video" not in set(capability.get("taskTypes") or []):
        raise GateError("selected model does not support pure text-to-video")

    text_input = (capability.get("inputCapabilities") or {}).get("text:prompt") or {}
    if not text_input.get("supported"):
        raise GateError("selected model lacks a source-validated text prompt capability")

    parameters = capability.get("parameters") or {}
    duration, duration_seconds = _lowest_option(parameters.get("duration") or {}, "s", "duration")
    resolution, _ = _lowest_option(parameters.get("resolution") or {}, "p", "resolution")

    count = parameters.get("numberOfVideos")
    if count:
        minimum = count.get("min")
        maximum = count.get("max")
        if (minimum is not None and minimum > 1) or (maximum is not None and maximum < 1):
            raise GateError("selected model capability does not permit exactly one video")

    aspect_ratio = None
    aspect = parameters.get("aspectRatio") or {}
    options = list(aspect.get("options") or [])
    if options:
        default = aspect.get("default")
        aspect_ratio = str(default if default in options else options[0])

    return SmokePlan(
        provider=provider,
        model=model,
        duration=duration,
        duration_seconds=duration_seconds,
        resolution=resolution,
        aspect_ratio=aspect_ratio,
    )


def _safe_relative_video(project_path: str, value: Any) -> bool:
    if not isinstance(value, str):
        return False
    raw = value.strip().replace("\\", "/")
    if not raw or re.match(r"^[A-Za-z]:", raw) or raw.startswith("/"):
        return False
    pure = PurePosixPath(raw)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
        return False
    if tuple(pure.parts[:2]) != ("generation", "videos"):
        return False
    project_root = Path(project_path).resolve()
    target = (project_root / Path(*pure.parts)).resolve()
    return project_root in target.parents and target.is_file()


def _load_runtime() -> SmokeRuntime:
    # Delayed imports: these modules may construct provider clients or resolve
    # credentials, so no import occurs until every coarse gate has passed.
    import asyncio

    from video_generation.capabilities import list_video_model_capabilities, validate_model_capability
    from video_generation.schemas import VideoGenerateRequest
    from video_generation.service import VideoGenerationService

    class RealSmokeRuntime:
        def validate_plan(self, provider: str, model: str) -> SmokePlan:
            matches = [
                capability
                for capability in list_video_model_capabilities()
                if capability.get("provider") == provider and capability.get("model") == model
            ]
            if len(matches) != 1:
                raise GateError("selected provider/model is not present exactly once in the capability registry")
            validate_model_capability(matches[0])
            return _validate_capability(provider, model, matches[0])

        def run(
            self,
            project_path: str,
            plan: SmokePlan,
            *,
            poll_max: int,
            poll_interval_seconds: float,
        ) -> SmokeResult:
            async def execute() -> SmokeResult:
                service = VideoGenerationService()
                request = VideoGenerateRequest(
                    projectPath=project_path,
                    provider=plan.provider,
                    model=plan.model,
                    videoMode="text-to-video",
                    prompt=FIXED_PROMPT,
                    aspectRatio=plan.aspect_ratio,
                    duration=plan.duration,
                    durationSeconds=plan.duration_seconds,
                    resolution=plan.resolution,
                    numberOfVideos=1,
                    images=[],
                    endImage=None,
                    publicAssetStorage=None,
                    customParams={},
                )

                # There is deliberately one create call and no create retry.
                task = await service.create_task(project_path, request)
                for _ in range(poll_max):
                    if task.status in TERMINAL_STATUSES:
                        break
                    await asyncio.sleep(poll_interval_seconds)
                    task = await service.query_task(project_path, task.id)

                if task.status not in TERMINAL_STATUSES:
                    return SmokeResult("timeout", False, "bounded polling expired")
                artifact = (task.outputs.get("video") or {}).get("relativePath")
                artifact_ready = task.status == "success" and _safe_relative_video(project_path, artifact)
                if task.status == "success" and not artifact_ready:
                    return SmokeResult("error", False, "safe local video artifact is unavailable")
                if task.status != "success":
                    return SmokeResult(task.status, False, "provider task did not complete successfully")
                return SmokeResult("success", True)

            return asyncio.run(execute())

    return RealSmokeRuntime()


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    runtime_factory: Callable[[], SmokeRuntime] | None = None,
    output: Callable[[str], None] = print,
) -> int:
    started = time.monotonic()
    try:
        args = _parser().parse_args(argv)
        provider, model = _coarse_gates(args, os.environ if environ is None else environ)
        runtime = (runtime_factory or _load_runtime)()
        plan = runtime.validate_plan(provider, model)

        with tempfile.TemporaryDirectory(prefix="node-canvas-video-smoke-") as project_path:
            with open(os.devnull, "w", encoding="utf-8") as discarded, contextlib.redirect_stdout(
                discarded
            ), contextlib.redirect_stderr(discarded):
                result = runtime.run(
                    project_path,
                    plan,
                    poll_max=args.poll_max,
                    poll_interval_seconds=args.poll_interval,
                )

        elapsed = time.monotonic() - started
        output(
            f"provider={provider} model={model} status={result.status} "
            f"safeRelativePath={str(result.artifact_ready).lower()} elapsedSeconds={elapsed:.1f}"
        )
        if result.error_summary:
            output("errorSummary=video smoke did not complete successfully")
        return 0 if result.status == "success" and result.artifact_ready else 1
    except GateError as exc:
        output(f"VIDEO REAL SMOKE REFUSED: {exc}")
        return 2
    except Exception as exc:
        # Exception text may contain credentials, endpoints, URLs, or raw
        # provider responses. Report only its type.
        output(f"VIDEO REAL SMOKE FAILED: runtime error ({type(exc).__name__})")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
