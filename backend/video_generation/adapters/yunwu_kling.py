from __future__ import annotations

from typing import Any

from video_generation.adapters.kling import KlingVideoAdapter
from video_generation.providers.kling import KlingVideoProvider


class YunwuKlingVideoAdapter(KlingVideoAdapter):
    provider = "yunwu-kling"
    adapter_id = "yunwu-kling:kling"

    def __init__(self, legacy_provider: Any | None = None):
        super().__init__(legacy_provider or KlingVideoProvider(provider_type="yunwu-kling"))
