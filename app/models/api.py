"""Typed API response models and error envelope."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ApiError(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Any] = Field(None, description="Optional error details payload")


class ErrorResponse(BaseModel):
    error: ApiError


class OkResp(BaseModel):
    ok: bool = True


class JobSummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    type: Optional[str] = None
    status: Optional[str] = None
    stage: Optional[str] = None
    progress: Optional[int] = None
    updated_at: Optional[str] = None
    error_message: Optional[str] = None
    out_path: Optional[str] = None


class JobDetail(JobSummary):
    created_at: Optional[str] = None
    duration_ms: Optional[int] = None
    result: Optional[Dict[str, Any]] = None
    logs: List[str] = []


class JobsListResp(BaseModel):
    jobs: List[JobSummary]


class DashboardUserSummary(BaseModel):
    id: int
    display_name: Optional[str] = None
    access_group: Optional[str] = None
    email_verified: bool
    role: str
    must_change_password: bool


class DashboardData(BaseModel):
    user: DashboardUserSummary
    providers: Dict[str, str]
    recent_jobs: List[JobSummary]
    active_jobs: List[JobSummary]
    recent_assets: List[Dict[str, str]]


class YouTubeUploadResp(OkResp):
    video_id: Optional[str] = None
    requested_visibility: Optional[str] = None
    scheduled_publish_at: Optional[str] = None
    youtube_response: Optional[Dict[str, Any]] = None


class QAResp(BaseModel):
    loop_score: float
    style_score: int
    watermark_flag: bool


class PackageResp(BaseModel):
    master_path: str
    audio_ms: int
    detail: Dict[str, Any]


class EnqueueJobResp(BaseModel):
    job_id: str


class ProfileKeysListResp(BaseModel):
    providers: List[str]


class PublicUserPayload(BaseModel):
    id: int
    email: Optional[str] = None
    full_name: Optional[str] = None
    access_group: Optional[str] = None
    is_verified: bool
    role: str
    must_change_password: bool


class OkUserResp(OkResp):
    user: PublicUserPayload


__all__ = [
    "ApiError",
    "DashboardData",
    "DashboardUserSummary",
    "EnqueueJobResp",
    "ErrorResponse",
    "JobDetail",
    "JobSummary",
    "JobsListResp",
    "OkResp",
    "PackageResp",
    "ProfileKeysListResp",
    "PublicUserPayload",
    "OkUserResp",
    "QAResp",
    "YouTubeUploadResp",
]
