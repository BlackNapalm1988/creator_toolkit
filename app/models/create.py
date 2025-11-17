"""Pydantic models for creation and generation endpoints."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class VideoGenReq(BaseModel):
    prompt: str
    duration_seconds: int = 4
    size: str | None = "720x1280"
    aspect_ratio: str | None = None
    loop_hint: bool = True
    video_type: str | None = None
    style_preset: str | None = None
    camera_motion: str | None = None
    seed: int | None = None
    remix_mode: bool | None = None
    base_scene_id: str | None = None
    remix_strength: float | None = None


class VideoStatusReq(BaseModel):
    job_id: str


class MusicGenReq(BaseModel):
    prompt: str = "lofi hip hop beat, warm, cozy, no vocals, vinyl crackle"
    duration_seconds: int = 180  # try ~3 min
    mood: str | None = "chill"
    genre: str | None = "lofi"


class MusicStatusReq(BaseModel):
    job_id: str


class ElevenGenerateForm(BaseModel):
    text: str
    voice_id: Optional[str] = None
    model_id: Optional[str] = None

    model_config = ConfigDict(protected_namespaces=())


__all__ = [
    "VideoGenReq",
    "VideoStatusReq",
    "MusicGenReq",
    "MusicStatusReq",
    "ElevenGenerateForm",
]
