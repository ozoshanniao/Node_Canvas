from abc import ABC, abstractmethod

from ..schemas import LLMGenerateRequest


class LLMProviderError(Exception):
    pass


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate(self, request: LLMGenerateRequest) -> str:
        pass

