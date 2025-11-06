"""Utilities for working with background job records."""

from __future__ import annotations

import datetime
from typing import Dict


def to_iso(ts: int | None) -> str | None:
    if not ts:
        return None
    try:
        return datetime.datetime.fromtimestamp(
            int(ts), tz=datetime.timezone.utc
        ).isoformat()
    except Exception:  # pragma: no cover - defensive
        return None


def extract_result(job: Dict[str, object]) -> Dict[str, object] | None:
    result = job.get("result")
    return result if isinstance(result, dict) else None


def extract_out_path(result: Dict[str, object] | None) -> str | None:
    if not result:
        return None
    path = result.get("out_path") or result.get("master_path")
    if not path:
        return None
    return str(path).replace("\\", "/")


def serialize_job(job: Dict[str, object]) -> Dict[str, object]:
    raw_progress = job.get("progress")
    try:
        progress_value = int(raw_progress) if raw_progress is not None else None
    except (TypeError, ValueError):
        progress_value = None

    updated_raw = job.get("updated_at")
    if isinstance(updated_raw, (int, float)):
        updated_value = to_iso(int(updated_raw))
    elif isinstance(updated_raw, str):
        updated_value = updated_raw
    else:
        updated_value = None

    result_payload = extract_result(job)
    out_path = extract_out_path(result_payload)

    return {
        "id": job.get("id"),
        "type": job.get("type"),
        "status": job.get("status"),
        "stage": job.get("stage"),
        "progress": progress_value,
        "updated_at": updated_value,
        "error_message": job.get("error_message"),
        "out_path": out_path,
    }


def serialize_job_detail(job: Dict[str, object]) -> Dict[str, object]:
    detail = serialize_job(job)
    created_raw = job.get("created_at")
    if isinstance(created_raw, (int, float)):
        created_value = to_iso(int(created_raw))
    elif isinstance(created_raw, str):
        created_value = created_raw
    else:
        created_value = None
    detail.update(
        {
            "created_at": created_value,
            "duration_ms": job.get("duration_ms"),
            "result": extract_result(job),
            "logs": (job.get("logs") or "").splitlines() if job.get("logs") else [],
        }
    )
    return detail


__all__ = [
    "extract_out_path",
    "extract_result",
    "serialize_job",
    "serialize_job_detail",
    "to_iso",
]
