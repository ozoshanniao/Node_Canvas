import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator


TASK_SCHEMA_VERSION = "v2"
MAX_TASK_TEXT_LENGTH = 512

_SECRET_PATTERN = re.compile(
    r"(?i)(authorization|bearer|signature|token|access[_ -]?key|secret|api[_ -]?key)"
    r"(?:\s*[:=]\s*|\s+)[^\s,;]+"
)
_TRACEBACK_PATTERN = re.compile(r"(?is)traceback \(most recent call last\):.*")
_URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)


def sanitize_task_text(value: Any, *, fallback: str | None = None) -> str | None:
    if value is None:
        return fallback
    text = value if isinstance(value, str) else str(value)
    text = _TRACEBACK_PATTERN.sub("[traceback removed]", text)
    text = _SECRET_PATTERN.sub(lambda match: f"{match.group(1)}=[redacted]", text)

    def sanitize_url(match: re.Match[str]) -> str:
        raw = match.group(0)
        trailing = ""
        while raw and raw[-1] in ".,;)]}":
            trailing = raw[-1] + trailing
            raw = raw[:-1]
        parsed = urlsplit(raw)
        clean = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
        return f"{clean}{trailing}"

    text = _URL_PATTERN.sub(sanitize_url, text)
    text = " ".join(text.replace("\r", " ").replace("\n", " ").split())
    if not text:
        return fallback
    return text[:MAX_TASK_TEXT_LENGTH]


class VideoGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    projectPath: str | None = None
    provider: str
    model: str
    videoMode: str
    prompt: str
    negativePrompt: str | None = None
    aspectRatio: str | None = None
    duration: str | None = None
    durationSeconds: int | None = None
    resolution: str | None = None
    qualityMode: str | None = None
    enableUpsample: bool | None = None
    generateAudio: bool | None = None
    returnLastFrame: bool | None = None
    publicAssetStorage: str | None = None
    seed: int | None = None
    numberOfVideos: int | None = None
    images: list[str] = Field(default_factory=list)
    endImage: str | None = None
    customParams: dict[str, Any] = Field(default_factory=dict)


class VideoTask(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    schemaVersion: str = TASK_SCHEMA_VERSION
    provider: str
    model: str
    videoMode: str
    status: str
    progress: int = 0
    queuePosition: int | None = None
    message: str = ""
    providerTaskId: str
    outputs: dict[str, Any] = Field(default_factory=dict)
    requestSnapshot: dict[str, Any] = Field(default_factory=dict)
    createdAt: int
    updatedAt: int
    error: str | None = None

    @field_validator("message", mode="before")
    @classmethod
    def _sanitize_message(cls, value: Any) -> str:
        return sanitize_task_text(value, fallback="") or ""

    @field_validator("error", mode="before")
    @classmethod
    def _sanitize_error(cls, value: Any) -> str | None:
        return sanitize_task_text(value)
