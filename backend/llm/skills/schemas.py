from typing import Literal

from pydantic import BaseModel, Field


class SoftSkill(BaseModel):
    id: str
    name: str
    description: str = ""
    source: Literal["global", "project"]
    path: str = Field(exclude=True)
    instructions: str = Field(exclude=True)
    enabled: bool = False
    type: Literal["soft"] = "soft"


class SoftSkillPublic(BaseModel):
    id: str
    name: str
    description: str = ""
    source: Literal["global", "project"]
    type: Literal["soft"] = "soft"
