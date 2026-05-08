from abc import ABC, abstractmethod

class BaseEngine(ABC):
    @abstractmethod
    async def generate(self, config: dict, prompt: str, save_path: str) -> str:
        pass