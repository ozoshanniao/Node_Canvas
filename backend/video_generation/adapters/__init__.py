from video_generation.adapters.base import LegacyVideoAdapter, VideoProviderAdapter
from video_generation.adapters.errors import (
    VideoProviderAdapterNotFound,
    VideoProviderError,
    classify_video_provider_error,
)
from video_generation.adapters.registry import (
    get_video_adapter,
    has_video_adapter,
    legacy_adapter_id_for_provider,
    list_video_adapters,
    register_legacy_video_adapter,
    register_video_adapter,
    resolve_adapter_for_capability,
)
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
    normalize_video_adapter_status,
)

__all__ = [
    "LegacyVideoAdapter",
    "VideoCreateRequest",
    "VideoCreateResult",
    "VideoInputAsset",
    "VideoProviderAdapter",
    "VideoProviderAdapterNotFound",
    "VideoProviderError",
    "VideoQueryRequest",
    "VideoQueryResult",
    "classify_video_provider_error",
    "get_video_adapter",
    "has_video_adapter",
    "legacy_adapter_id_for_provider",
    "list_video_adapters",
    "normalize_video_adapter_status",
    "register_legacy_video_adapter",
    "register_video_adapter",
    "resolve_adapter_for_capability",
]
