from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from engines.image_utils import encode_base64, prepare_provider_image_inputs


@dataclass
class PreparedLLMImageInput:
    index: int
    mime_type: str
    raw_data: bytes | None
    base64_data: str | None
    original_url: str = ""

    @property
    def data_url(self) -> str:
        if not self.base64_data:
            raise ValueError(f"Image input {self.index} does not have base64 data")
        return f"data:{self.mime_type};base64,{self.base64_data}"

    @property
    def yunwu_image_url(self) -> str:
        if is_public_http_url(self.original_url):
            return self.original_url
        return self.data_url

    @property
    def url_for_api(self) -> str:
        return self.yunwu_image_url

    @property
    def is_public_url(self) -> bool:
        return is_public_http_url(self.url_for_api)

    @property
    def is_data_url(self) -> bool:
        return self.url_for_api.startswith("data:image/")


def _generation_dir(project_path: str | None) -> str | None:
    if not project_path:
        return None
    return str(Path(project_path) / "generation")


def _input_dir(project_path: str | None) -> str | None:
    if not project_path:
        return None
    return str(Path(project_path) / "input")


def _item_index(item, fallback_index: int) -> int:
    if isinstance(item, dict):
        return int(item.get("index", fallback_index))
    return int(getattr(item, "index", fallback_index))


def _item_url(item) -> str:
    if isinstance(item, dict):
        return str(item.get("url") or "")
    return str(getattr(item, "url", "") or "")


def is_public_http_url(url: str) -> bool:
    parsed = urlparse(url or "")
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    return host not in {"127.0.0.1", "localhost", "0.0.0.0", "::1"}


async def prepare_llm_image_inputs(
    image_inputs,
    project_path: str | None = None,
    *,
    prefer_public_urls: bool = False,
) -> list[PreparedLLMImageInput]:
    ordered_items = sorted(
        enumerate(image_inputs or []),
        key=lambda pair: _item_index(pair[1], pair[0]),
    )
    indexed_urls = [
        (_item_index(item, fallback_index), _item_url(item))
        for fallback_index, item in ordered_items
        if _item_url(item)
    ]
    urls = [url for _, url in indexed_urls]
    if not urls:
        return []

    results = []
    for index, url in indexed_urls:
        if prefer_public_urls and is_public_http_url(url):
            results.append(
                PreparedLLMImageInput(
                    index=index,
                    mime_type="image/png",
                    raw_data=None,
                    base64_data=None,
                    original_url=url,
                )
            )
            continue

        try:
            # Support both generation/ and input/ relative paths
            search_dirs = []
            if project_path:
                search_dirs.append(_generation_dir(project_path))
                search_dirs.append(_input_dir(project_path))

            prepared = await prepare_provider_image_inputs(
                [url],
                search_dirs[0] if search_dirs else None,
                prefer="base64",
            )
        except Exception as exc:
            raise ValueError(f"Failed to read LLM image input: {exc}") from exc

        image = prepared[0] if prepared else None
        if not image:
            raise ValueError(f"Failed to read LLM image input at index {index}")
        if not image.raw_data:
            raise ValueError(f"Failed to read LLM image input at index {index}")
        results.append(
            PreparedLLMImageInput(
                index=index,
                mime_type=image.mime_type or "image/png",
                raw_data=image.raw_data,
                base64_data=image.base64_data or encode_base64(image.raw_data),
                original_url=url,
            )
        )
    return results
