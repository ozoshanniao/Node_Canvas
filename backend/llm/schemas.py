from typing import Optional

from pydantic import BaseModel


class LLMGenerateRequest(BaseModel):
    provider: str
    model: str
    inputText: str
    temperature: Optional[float] = 0.85
    maxTokens: Optional[int] = 8192
    thinkingLevel: Optional[str] = None

