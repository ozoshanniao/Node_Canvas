from __future__ import annotations

import os
import re
from dataclasses import dataclass, replace
from typing import Any

from google import genai
from google.genai import interactions, types



SAFE_FAILURE_MESSAGE = "Gemini Omni video generation failed."
SAFE_PROJECT_CONFIGURATION_MESSAGE = "Google Omni project configuration is unavailable."
UNSUPPORTED_DELIVERY_MESSAGE = "Gemini Omni URI delivery is not supported."
PROJECT_ENV_NAMES = (
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_PROJECT_ID",
    "GOOGLE_PROJECT",
)
PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$")


@dataclass(frozen=True)
class VideoCreateDiagnostics:
    error_category: str | None = None
    http_status_class: str = "none"
    exception_type: str = "none"
    response_received: bool = False
    http_response_received: bool = False
    interaction_completed: bool = False
    video_output_present: bool = False
    video_bytes_present: bool = False
    uri_scheme_class: str = "none"
    materialization_entered: bool = False
    project_resolution_completed: bool = False
    client_initialization_completed: bool = False
    sdk_create_entered: bool = False
    sdk_request_serialized: bool = False
    transport_invocation_started: bool = False
    provider_response_received: bool = False
    failure_stage: str = "unknown"
    project_configuration_state: str = "unresolved"
    project_configuration_source: str = "unknown"


@dataclass(frozen=True)
class RuntimeProjectConfiguration:
    passed: bool
    state: str
    source: str


class ProjectConfigurationError(ValueError):
    def __init__(self, state: str, source: str):
        super().__init__(SAFE_PROJECT_CONFIGURATION_MESSAGE)
        self.state = state if state in {"missing", "blank", "invalid", "unresolved"} else "unresolved"
        self.source = source if source in {"configured", "absent", "unknown"} else "unknown"




def _safe_attribute(value: Any, name: str) -> Any:
    try:
        return getattr(value, name, None)
    except Exception:
        return None


def _numeric_status(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    enum_value = _safe_attribute(value, "value")
    return enum_value if isinstance(enum_value, int) and not isinstance(enum_value, bool) else None


def classify_google_omni_exception(exc: BaseException) -> VideoCreateDiagnostics:
    response = _safe_attribute(exc, "response")
    status_code = None
    for source, names in (
        (exc, ("status_code", "status", "code")),
        (response, ("status_code",)),
    ):
        if source is None:
            continue
        for name in names:
            status_code = _numeric_status(_safe_attribute(source, name))
            if status_code is not None:
                break
        if status_code is not None:
            break

    if status_code == 401:
        category = "auth"
    elif status_code == 403:
        category = "permission"
    elif status_code == 404:
        category = "model_or_location"
    elif status_code == 429:
        category = "rate_limit"
    elif status_code is not None and 400 <= status_code < 500:
        category = "request_validation"
    elif status_code is not None and 500 <= status_code < 600:
        category = "provider_unavailable"
    else:
        category = "sdk_error"

    exception_type = type(exc).__name__
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", exception_type):
        exception_type = "Exception"
    return VideoCreateDiagnostics(
        error_category=category,
        http_status_class=(
            "4xx" if status_code is not None and 400 <= status_code < 500
            else "5xx" if status_code is not None and 500 <= status_code < 600
            else "none"
        ),
        exception_type=exception_type,
        response_received=response is not None or status_code is not None,
        http_response_received=response is not None or status_code is not None,
    )


class GoogleOmniCreateError(Exception):
    def __init__(
        self,
        diagnostics: VideoCreateDiagnostics,
        message: str = SAFE_FAILURE_MESSAGE,
    ):
        super().__init__(message)
        self.diagnostics = diagnostics



def _response_delivery(request: interactions.CreateModelInteraction) -> str:
    response_format = getattr(request, "response_format", None)
    if isinstance(response_format, list):
        response_format = response_format[0] if len(response_format) == 1 else None
    delivery = getattr(response_format, "delivery", None)
    if not isinstance(delivery, str):
        return "inline"
    return delivery.strip().lower() or "inline"

def _create_body_kwargs(request: interactions.CreateModelInteraction) -> dict[str, Any]:
    if getattr(request, "model", None) is None or getattr(request, "input", None) is None:
        raise ValueError("Google Omni create body requires model and input")
    allowed_fields = (
        "model",
        "input",
        "response_format",
        "generation_config",
        "background",
        "store",
        "stream",
    )
    return {
        field: value
        for field in allowed_fields
        if (value := getattr(request, field, None)) is not None
    }


def run_blocked_transport_contract(
    request: interactions.CreateModelInteraction,
) -> dict[str, bool]:
    import json

    import httpx
    from google.auth.credentials import Credentials

    state = {
        "project_resolution_contract": True,
        "client_construction_contract": False,
        "request_validation": False,
        "request_serialization": False,
        "mock_transport_reached": False,
    }

    class BlockedTransport(Exception):
        pass

    class ContractCredentials(Credentials):
        def __init__(self):
            super().__init__()
            self.token = "blocked-transport-contract"

        def refresh(self, _request):
            raise AssertionError("contract credentials must not refresh")

    def handler(http_request: httpx.Request) -> httpx.Response:
        state["mock_transport_reached"] = True
        body = json.loads(http_request.content)
        response_format = body.get("response_format") or {}
        generation_config = body.get("generation_config") or {}
        video_config = generation_config.get("video_config") or {}
        state["request_serialization"] = (
            bool(body.get("model"))
            and body.get("input") is not None
            and response_format.get("type") == "video"
            and response_format.get("aspect_ratio") == "16:9"
            and response_format.get("delivery") == "inline"
            and video_config.get("task") == "text_to_video"
            and body.get("background") is False
            and body.get("store") is False
            and body.get("stream") is False
            and "duration" not in response_format
        )
        raise BlockedTransport()

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    client = None
    try:
        client = genai.Client(
            vertexai=True,
            project="contract-project",
            location="global",
            credentials=ContractCredentials(),
            http_options=types.HttpOptions(
                headers={"Api-Revision": "2026-05-20"},
                httpx_client=http_client,
            ),
        )
        state["client_construction_contract"] = True
        body_kwargs = _create_body_kwargs(request)
        state["request_validation"] = True
        try:
            client.interactions.create(**body_kwargs)
        except BlockedTransport:
            pass
        except Exception:
            pass
    finally:
        if client is not None:
            client.close()
        http_client.close()
    return state


class GoogleOmniProvider:
    """Synchronous Vertex Interactions client for Gemini Omni video."""

    def __init__(self, project: str | None = None, client: Any | None = None):
        self.project = project
        self.client = client
        self.last_diagnostics = VideoCreateDiagnostics()

    def _project(self) -> str:
        if self.project is not None:
            source = "configured"
            project = self.project
        else:
            configured_values = [os.environ[name] for name in PROJECT_ENV_NAMES if name in os.environ]
            source = "configured" if configured_values else "absent"
            project = next((value for value in configured_values if str(value).strip()), None)

        if project is None:
            state = "blank" if source == "configured" else "missing"
            raise ProjectConfigurationError(state, source)
        normalized = str(project).strip()
        if not normalized:
            raise ProjectConfigurationError("blank", source)
        if re.search(r"\s", normalized) or not PROJECT_ID_PATTERN.fullmatch(normalized):
            raise ProjectConfigurationError("invalid", source)
        return normalized

    def runtime_project_configuration(self) -> RuntimeProjectConfiguration:
        try:
            self._project()
        except ProjectConfigurationError as exc:
            return RuntimeProjectConfiguration(False, exc.state, exc.source)
        except Exception:
            return RuntimeProjectConfiguration(False, "unresolved", "unknown")
        return RuntimeProjectConfiguration(True, "configured", "configured")

    def _build_client(self, project: str):
        return genai.Client(
            vertexai=True,
            project=project,
            location="global",
            http_options=types.HttpOptions(
                headers={"Api-Revision": "2026-05-20"},
            ),
        )

    def _client(self):
        if self.client is None:
            self.client = self._build_client(self._project())
        return self.client

    def _safe_failure(
        self,
        exc: BaseException,
        diagnostics: VideoCreateDiagnostics,
        stage: str,
    ) -> GoogleOmniCreateError:
        if stage == "project_resolution":
            state = exc.state if isinstance(exc, ProjectConfigurationError) else "unresolved"
            source = exc.source if isinstance(exc, ProjectConfigurationError) else "unknown"
            self.last_diagnostics = replace(
                diagnostics,
                error_category="project_configuration",
                exception_type=(
                    "ProjectConfigurationError"
                    if isinstance(exc, ProjectConfigurationError)
                    else "Exception"
                ),
                failure_stage=stage,
                project_configuration_state=state,
                project_configuration_source=source,
            )
            return GoogleOmniCreateError(self.last_diagnostics)
        classified = classify_google_omni_exception(exc)
        self.last_diagnostics = replace(
            diagnostics,
            error_category=classified.error_category,
            http_status_class=classified.http_status_class,
            exception_type=classified.exception_type,
            response_received=classified.response_received,
            http_response_received=classified.http_response_received,
            sdk_request_serialized=diagnostics.sdk_request_serialized or classified.http_response_received,
            provider_response_received=False,
            failure_stage=stage,
        )
        return GoogleOmniCreateError(self.last_diagnostics)

    def create_interaction(
        self,
        request: interactions.CreateModelInteraction,
    ) -> interactions.Interaction:
        diagnostics = VideoCreateDiagnostics()
        if _response_delivery(request) != "inline":
            self.last_diagnostics = replace(
                diagnostics,
                error_category="unsupported_delivery",
                exception_type="Exception",
                failure_stage="request_validation",
            )
            raise GoogleOmniCreateError(
                self.last_diagnostics,
                UNSUPPORTED_DELIVERY_MESSAGE,
            )
        if self.client is None:
            try:
                project = self._project()
            except Exception as exc:
                raise self._safe_failure(exc, diagnostics, "project_resolution") from None
            diagnostics = replace(
                diagnostics,
                project_resolution_completed=True,
                project_configuration_state="configured",
                project_configuration_source="configured",
            )
            try:
                self.client = self._build_client(project)
            except Exception as exc:
                raise self._safe_failure(exc, diagnostics, "client_initialization") from None
            diagnostics = replace(diagnostics, client_initialization_completed=True)
        try:
            body_kwargs = _create_body_kwargs(request)
        except Exception as exc:
            raise self._safe_failure(exc, diagnostics, "sdk_request_validation") from None
        diagnostics = replace(
            diagnostics,
            sdk_create_entered=True,
            transport_invocation_started=True,
        )
        try:
            interaction = self.client.interactions.create(**body_kwargs)
        except Exception as exc:
            classified = classify_google_omni_exception(exc)
            stage = "provider_response" if classified.http_response_received else "sdk_request_serialization"
            raise self._safe_failure(exc, diagnostics, stage) from None
        self.last_diagnostics = replace(
            diagnostics,
            sdk_request_serialized=True,
            transport_invocation_started=True,
            provider_response_received=True,
            response_received=True,
            http_response_received=True,
            failure_stage="none",
        )
        return interaction
