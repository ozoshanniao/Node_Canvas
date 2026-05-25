from typing import List, Optional

from pydantic import BaseModel, Field


class LLMImageInputItem(BaseModel):
    index: int
    url: str


class LLMGenerateRequest(BaseModel):
    provider: str
    model: str
    inputText: str = ""
    imageInputs: List[LLMImageInputItem] = Field(default_factory=list)
    projectPath: Optional[str] = None
    systemPrompt: Optional[str] = None
    temperature: Optional[float] = 0.85
    maxTokens: Optional[int] = 8192
    thinkingLevel: Optional[str] = None
    thinking: Optional[str] = None
    reasoningEffort: Optional[str] = None
    enabledSkills: List[str] = Field(default_factory=list)
