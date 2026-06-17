from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


VideoProviderErrorCategory = Literal[
    "auth_error",
    "permission_error",
    "quota_error",
    "rate_limited",
    "validation_error",
    "safety_error",
    "network_error",
    "provider_error",
    "timeout",
    "unknown",
]


@dataclass
class VideoProviderError(Exception):
    provider: str
    message: str
    code: str | None = None
    retryable: bool = False
    raw_status: str | None = None
    category: VideoProviderErrorCategory = "unknown"

    def __str__(self) -> str:
        prefix = f"{self.provider}: " if self.provider else ""
        return f"{prefix}{self.message}"


class VideoProviderAdapterNotFound(VideoProviderError):
    def __init__(self, provider: str):
        super().__init__(
            provider=provider,
            message=f"No video provider adapter registered for provider: {provider}",
            code="adapter_not_found",
            retryable=False,
            category="validation_error",
        )


ERROR_CATEGORY_KEYWORDS: tuple[tuple[VideoProviderErrorCategory, tuple[str, ...], bool], ...] = (
    ("auth_error", ("unauthorized", "unauthenticated", "api key", "apikey", "authorization", "credentials", "invalid token", "401", "kling code 1000", "kling code 1001", "kling code 1002", "kling code 1003", "kling code 1004"), False),
    ("permission_error", ("permission", "forbidden", "project", "region", "403", "kling code 1103"), False),
    ("quota_error", ("quota", "insufficient credits", "billing", "kling code 1101", "kling code 1102", "kling code 1302", "kling code 1303"), False),
    ("rate_limited", ("rate limit", "rate_limited", "too many requests", "429"), True),
    ("validation_error", ("invalid", "validation", "bad request", "400", "kling code 1200", "kling code 1201"), False),
    ("safety_error", ("safety", "policy", "blocked", "moderation", "kling code 1300", "kling code 1301"), False),
    ("network_error", ("network", "connection", "dns", "socket", "unreachable"), True),
    ("timeout", ("timeout", "timed out", "deadline", "kling code 5002"), True),
    ("provider_error", ("provider", "upstream", "server error", "500", "502", "503", "504", "kling code 5000", "kling code 5001"), True),
)


def classify_video_provider_error(message: str | None, raw_status: str | None = None) -> tuple[VideoProviderErrorCategory, bool]:
    text = f"{message or ''} {raw_status or ''}".lower()
    for category, keywords, retryable in ERROR_CATEGORY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return category, retryable
    return "unknown", False
