from __future__ import annotations

from typing import Any

import httpx

from settings_resolver import resolve_provider_secret
from video_generation.adapters.errors import VideoProviderError, classify_video_provider_error


KIE_BASE_URL = "https://api.kie.ai"
KIE_CREATE_TASK_PATH = "/api/v1/jobs/createTask"
KIE_RECORD_INFO_PATH = "/api/v1/jobs/recordInfo"


class KieClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = KIE_BASE_URL,
        create_timeout: float = 30.0,
        query_timeout: float = 20.0,
    ):
        self._api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.create_timeout = create_timeout
        self.query_timeout = query_timeout

    def _api_key_value(self) -> str:
        value = self._api_key or resolve_provider_secret("kie", "apiKey", "KIE_API_KEY")
        if not value:
            raise self._error("KIE credentials are not configured", raw_status="401")
        return value

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key_value()}",
            "Content-Type": "application/json",
        }

    async def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{KIE_CREATE_TASK_PATH}"
        try:
            async with httpx.AsyncClient(timeout=self.create_timeout) as client:
                response = await client.post(url, headers=self._headers(), json=payload)
            body = self._json_body(response)
            if response.is_error:
                raise self._error(
                    f"KIE createTask failed with HTTP {response.status_code}: {self._body_message(body)}",
                    raw_status=str(response.status_code),
                )
            self._raise_for_business_error(body, "KIE createTask failed")
            return body
        except VideoProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise self._error(f"KIE createTask timed out: {exc}", raw_status="timeout") from exc
        except httpx.HTTPError as exc:
            raise self._error(f"KIE createTask network error: {exc}", raw_status="network") from exc

    async def get_task(self, task_id: str) -> dict[str, Any]:
        url = f"{self.base_url}{KIE_RECORD_INFO_PATH}"
        try:
            async with httpx.AsyncClient(timeout=self.query_timeout) as client:
                response = await client.get(url, headers=self._headers(), params={"taskId": task_id})
            body = self._json_body(response)
            if response.is_error:
                raise self._error(
                    f"KIE recordInfo failed with HTTP {response.status_code}: {self._body_message(body)}",
                    raw_status=str(response.status_code),
                )
            self._raise_for_business_error(body, "KIE recordInfo failed")
            return body
        except VideoProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise self._error(f"KIE recordInfo timed out: {exc}", raw_status="timeout") from exc
        except httpx.HTTPError as exc:
            raise self._error(f"KIE recordInfo network error: {exc}", raw_status="network") from exc

    def _json_body(self, response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError:
            payload = {"msg": response.text}
        return payload if isinstance(payload, dict) else {"data": payload}

    def _raise_for_business_error(self, body: dict[str, Any], fallback: str) -> None:
        code = body.get("code")
        if code is not None and str(code) != "200":
            raise self._error(f"{fallback}: {self._body_message(body)}", raw_status=str(code))

    def _body_message(self, body: dict[str, Any]) -> str:
        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        for key in ("failMsg", "errorMessage", "message", "msg", "error"):
            value = data.get(key) if key in data else body.get(key)
            if value:
                return str(value)
        return "Unknown KIE provider error"

    def _error(self, message: str, raw_status: str | None = None) -> VideoProviderError:
        category, retryable = classify_video_provider_error(message, raw_status)
        return VideoProviderError(
            provider="kie",
            message=message,
            code=category,
            retryable=retryable,
            raw_status=raw_status,
            category=category,
        )
