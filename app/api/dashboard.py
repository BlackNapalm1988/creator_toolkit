"""Dashboard-related API routes."""

from __future__ import annotations

from typing import Annotated, Dict, List

from fastapi import APIRouter, Depends

from app.deps import current_active_user
from app.models.api import DashboardData, ErrorResponse
from app.models.jobs import serialize_job
from app.services.users import user_payload
from modules.jobs import list_active_jobs, list_jobs
from modules.users import list_user_keys

router = APIRouter(tags=["Dashboard"])


@router.get(
    "/dashboard/data",
    response_model=DashboardData,
    responses={
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized",
            "content": {
                "application/json": {
                    "example": {
                        "error": {"code": "unauthorized", "message": "Missing token"}
                    }
                }
            },
        }
    },
)
def dashboard_data(user: Annotated[dict, Depends(current_active_user)]):
    """Return aggregated dashboard data for the signed-in user."""

    payload = user_payload(user)
    user_summary = {
        "id": payload.get("id"),
        "display_name": payload.get("full_name") or payload.get("email"),
        "access_group": payload.get("access_group"),
        "email_verified": bool(payload.get("is_verified")),
        "role": payload.get("role"),
        "must_change_password": bool(payload.get("must_change_password")),
    }

    stored_keys = list_user_keys(payload["id"])
    providers = {}
    for provider in ("openai", "elevenlabs", "youtube"):
        providers[provider] = "connected" if stored_keys.get(provider) else "missing"

    recent_jobs = [serialize_job(job) for job in list_jobs(limit=10)]
    active_jobs = [serialize_job(job) for job in list_active_jobs(limit=10)]

    recent_assets: List[Dict[str, str]] = []

    return {
        "user": user_summary,
        "providers": providers,
        "recent_jobs": recent_jobs,
        "active_jobs": active_jobs,
        "recent_assets": recent_assets,
    }


__all__ = ["router"]
