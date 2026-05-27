import os
from urllib.parse import urljoin

import httpx


class SeedanceClientError(ValueError):
    pass


class SeedanceOfficialClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or os.getenv("ARK_API_KEY")
        self.base_url = (base_url or os.getenv("ARK_BASE_URL") or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise ValueError("ARK_API_KEY is not configured")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _url(self, endpoint: str) -> str:
        return urljoin(f"{self.base_url}/", endpoint.strip("/"))

    def _parse_response(self, response: httpx.Response) -> dict:
        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text}
        if not isinstance(payload, dict):
            payload = {"data": payload}
        if response.is_error:
            raise SeedanceClientError(f"Seedance HTTP {response.status_code}: {payload}")
        error = payload.get("error")
        if error:
            raise SeedanceClientError(f"Seedance error: {error}")
        return payload

    async def create_task(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self._url("/contents/generations/tasks"),
                headers=self._headers(),
                json=payload,
            )
            return self._parse_response(response)

    async def query_task(self, task_id: str) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                self._url(f"/contents/generations/tasks/{task_id}"),
                headers=self._headers(),
            )
            return self._parse_response(response)
