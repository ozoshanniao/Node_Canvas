from abc import ABC, abstractmethod

from video_generation.schemas import VideoGenerateRequest


class BaseVideoProvider(ABC):
    @abstractmethod
    async def create_task(self, request: VideoGenerateRequest) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def query_task(self, provider_task_id: str) -> dict:
        raise NotImplementedError
