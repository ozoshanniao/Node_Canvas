import os
from abc import ABC, abstractmethod
from urllib.parse import urljoin

import httpx

from video_generation.providers.kling.auth import encode_kling_jwt


class KlingClientError(ValueError):
    pass


class BaseKlingClient(ABC):
    def __init__(self, base_url: str, path_prefix: str = ""):
        self.base_url = base_url.rstrip("/")
        self.path_prefix = path_prefix.strip("/")

    @abstractmethod
    def _headers(self) -> dict[str, str]:
        raise NotImplementedError

    def _url(self, endpoint: str) -> str:
        endpoint_path = endpoint.strip("/")
        if self.path_prefix:
            endpoint_path = f"{self.path_prefix}/{endpoint_path}"
        return urljoin(f"{self.base_url}/", endpoint_path)

    def _parse_response(self, response: httpx.Response) -> dict:
        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text}

        if not isinstance(payload, dict):
            payload = {"data": payload}

        if response.is_error:
            raise KlingClientError(f"Kling HTTP {response.status_code}: {payload}")

        code = payload.get("code")
        if code not in (None, 0, "0"):
            request_id = payload.get("request_id") or payload.get("requestId")
            message = payload.get("message") or payload.get("msg") or "Kling API returned an error"
            raise KlingClientError(f"Kling code {code}: {message}; request_id={request_id or ''}".strip())

        return payload

    async def post(self, endpoint: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(self._url(endpoint), headers=self._headers(), json=payload)
            return self._parse_response(response)

    async def get(self, endpoint: str) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(self._url(endpoint), headers=self._headers())
            return self._parse_response(response)


class KlingOfficialClient(BaseKlingClient):
    def __init__(
        self,
        access_key: str | None = None,
        secret_key: str | None = None,
        base_url: str | None = None,
    ):
        super().__init__(base_url or os.getenv("KLING_API_BASE") or "https://api-beijing.klingai.com")
        self.access_key = access_key or os.getenv("KLING_ACCESS_KEY")
        self.secret_key = secret_key or os.getenv("KLING_SECRET_KEY")

    def _headers(self) -> dict[str, str]:
        if not self.access_key or not self.secret_key:
            raise ValueError("KLING_ACCESS_KEY and KLING_SECRET_KEY are not configured")
        token = encode_kling_jwt(self.access_key, self.secret_key)
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }


class YunwuKlingClient(BaseKlingClient):
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        path_prefix: str | None = None,
    ):
        resolved_base_url = base_url or os.getenv("YUNWU_BASE_URL")
        if not resolved_base_url:
            resolved_base_url = ""
        super().__init__(resolved_base_url, path_prefix if path_prefix is not None else os.getenv("YUNWU_KLING_PATH_PREFIX", ""))
        self.api_key = api_key or os.getenv("YUNWU_API_KEY")

    def _headers(self) -> dict[str, str]:
        if not self.api_key or not self.base_url:
            raise ValueError("YUNWU_API_KEY and YUNWU_BASE_URL are not configured")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
