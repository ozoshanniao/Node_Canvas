from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ImageInputItem:
    index: int
    url: Optional[str] = None


@dataclass
class ImageGenerationRequest:
    provider: str
    model: str | None
    prompt: str
    config: dict[str, Any]
    project_path: str
    image_inputs: list[str | ImageInputItem | dict[str, Any]] = field(default_factory=list)
    generation_dir: str | None = None


@dataclass
class ImageGenerationResult:
    url: str | None = None
    urls: list[str] | None = None

    def to_response_data(self) -> dict[str, Any]:
        if self.urls is not None:
            return {"urls": self.urls}
        return {"url": self.url}
