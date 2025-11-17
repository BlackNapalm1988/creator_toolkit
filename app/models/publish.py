"""Pydantic models for publishing, packaging, and QA endpoints."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class YouTubeUploadRequest(BaseModel):
    """Request payload for JSON-based YouTube uploads."""

    model_config = ConfigDict(extra="forbid")

    video_path: Optional[str] = Field(None, examples=["my/cool/video_path.mp4"])
    title: Optional[str] = Field(None, examples=["My Super Cool Video!"])
    description: Optional[str] = Field("", examples=["Created with Creator Toolkit"])
    tags: Optional[List[str]] = Field(None, examples=["#Cool, #Videos, #Only"])
    privacy_status: Optional[str] = Field(
        "unlisted", examples=["Public, Unlisted, Private"]
    )
    publish_at: Optional[str] = Field(None, examples=["2025-11-02T18:00:00Z"])
    video_type: Optional[str] = Field(None, examples=["standard", "short"])
    category_id: Optional[str] = Field(None, examples=["10"])
    made_for_kids: Optional[bool] = Field(None, examples=[True, False])
    playlist_id: Optional[str] = Field(None, examples=["my-playlist-id"])
    thumbnail_path: Optional[str] = Field(None, examples=["static/thumbs/example.jpg"])
    library_path: Optional[str] = Field(None, examples=["static/final/clip.mp4"])


class EnqueuePackageReq(BaseModel):
    loop_video_path: str
    audio_path: str
    fade_in_ms: int = 500
    fade_out_ms: int = 800
    out_path: str | None = None


class EnqueueQABatchReq(BaseModel):
    paths: list
    palette: list = []
    thresholds: dict = {"loop": 0.92, "style": 75}


class PublishPipelineReq(BaseModel):
    # creative / branding
    title: str
    description: str
    tags: Optional[str] = ""  # comma-separated list

    # source assets
    loop_path: str  # e.g. "static/uploads/my_loop.mp4"
    song_path: str  # e.g. "static/uploads/my_song.mp3"
    duration_ms: int  # e.g. 180000 for ~3 mins

    # narration
    narration_text: Optional[str] = None
    narration_voice_id: Optional[str] = None

    # how to publish
    privacy_status: str = "unlisted"  # "public" | "unlisted" | "private"
    publish_at: Optional[str] = None


class CompileReq(BaseModel):
    scene_yaml_path: str


class PackageReq(BaseModel):
    loop_video_path: str
    audio_path: str
    fade_in_ms: int = 500
    fade_out_ms: int = 800
    out_path: str | None = None


class PackageReqV2(BaseModel):
    loop_path: str
    song_path: str
    out_name: str
    duration_ms: int
    voiceover_path: Optional[str] = None


__all__ = [
    "CompileReq",
    "EnqueuePackageReq",
    "EnqueueQABatchReq",
    "PackageReq",
    "PackageReqV2",
    "PublishPipelineReq",
    "YouTubeUploadRequest",
]
