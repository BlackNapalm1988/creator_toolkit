from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "complete", "failed"]


class JobBase(BaseModel):
    id: str
    status: JobStatus
    stage: Optional[str] = None
    progress: Optional[int] = None
    logs: List[str] = Field(default_factory=list)
    out_path: Optional[str] = None
    error_message: Optional[str] = None
    updated_at: Optional[str] = None


class JobDetail(JobBase):
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    duration_ms: Optional[int] = None
    result: Optional[Dict[str, Any]] = None


def build_job_base(raw: Dict[str, Any]) -> JobBase:
    return JobBase(
        id=str(raw.get("id")),
        status=str(raw.get("status")),
        stage=raw.get("stage"),
        progress=(int(raw["progress"]) if raw.get("progress") is not None else None),
        logs=list(raw.get("logs") or []),
        out_path=raw.get("out_path"),
        error_message=raw.get("error_message"),
        updated_at=raw.get("updated_at"),
    )


def build_job_detail(raw: Dict[str, Any]) -> JobDetail:
    base = build_job_base(raw).model_dump()
    return JobDetail(
        **base,
        created_at=raw.get("created_at"),
        duration_ms=raw.get("duration_ms"),
        result=raw.get("result"),
    )
