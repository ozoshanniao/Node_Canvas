from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class VideoGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    projectPath: str | None = None
    provider: str
    model: str
    videoMode: str
    prompt: str
    negativePrompt: str | None = None
    aspectRatio: str | None = None
    duration: str | None = None
    durationSeconds: int | None = None
    resolution: str | None = None
    qualityMode: str | None = None
    enableUpsample: bool | None = None
    generateAudio: bool | None = None
    returnLastFrame: bool | None = None
    publicAssetStorage: str | None = None
    seed: int | None = None
    numberOfVideos: int | None = None
    images: list[str] = Field(default_factory=list)
    endImage: str | None = None
    customParams: dict[str, Any] = Field(default_factory=dict)


class VideoTask(BaseModel):
    id: str
    provider: str
    model: str
    videoMode: str
    # Canonical backend statuses are queued, running, success, error, cancelled, and interrupted.
    # interrupted means the local query/download chain failed while the provider task may still be running.
    # Older project files may still contain frontend transitional statuses.
    status: str
    progress: int
    message: str
    providerTaskId: str
    remoteVideoUrl: str | None = None
    localVideoUrl: str | None = None
    outputs: dict[str, Any] = Field(default_factory=dict)
    request: dict[str, Any] = Field(default_factory=dict)
    createdAt: int
    updatedAt: int
    error: str | None = None
