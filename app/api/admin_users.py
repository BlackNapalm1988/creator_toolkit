"""Admin-only user management endpoints for the settings panel."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import require_role
from app.models.admin_users import (
    AdminPasswordChangeReq,
    AdminUserCreateReq,
    AdminUserCreateResp,
    AdminUserDetailResp,
    AdminUsersListResp,
    AdminUserUpdateReq,
)
from app.models.api import ErrorResponse
from modules import auth as auth_module
from modules.users import (
    VALID_ROLES,
    create_user,
    get_user_by_id,
    list_users,
    update_password_hash,
    update_user_admin,
)

router = APIRouter(prefix="/admin/users", tags=["Admin Users"])


def _ts_to_iso(ts) -> str | None:
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def _serialize_user(user: Dict[str, object]) -> Dict[str, object]:
    return {
        "id": user["id"],
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "role": user.get("role"),
        "access_group": user.get("access_group"),
        "workspace": user.get("workspace"),
        "is_active": bool(user.get("is_active", True)),
        "is_verified": bool(user.get("is_verified")),
        "created_at": _ts_to_iso(user.get("created_at")),
        "last_login_at": _ts_to_iso(user.get("last_login_at")),
    }


def _ensure_user(user_id: int) -> Dict[str, object]:
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get(
    "", response_model=AdminUsersListResp, responses={403: {"model": ErrorResponse}}
)
def admin_users_list(
    q: str | None = Query(None),
    user=Depends(require_role(["admin"], require_verified=True)),
):
    """Return all users sorted by creation date with optional filtering."""

    users = list_users(search=q)
    return {"users": [_serialize_user(u) for u in users], "roles": sorted(VALID_ROLES)}


@router.get(
    "/{user_id}",
    response_model=AdminUserDetailResp,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_users_detail(
    user_id: int, user=Depends(require_role(["admin"], require_verified=True))
):
    record = _ensure_user(user_id)
    return {"user": _serialize_user(record)}


@router.post(
    "",
    response_model=AdminUserCreateResp,
    responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_users_create(
    req: AdminUserCreateReq,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    password = req.password.strip() if req.password else None
    generated_password = None
    if req.generate_password:
        generated_password = auth_module.generate_password()
        password = generated_password
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")

    try:
        user_id = create_user(
            email=req.email,
            full_name=req.full_name,
            password_hash=auth_module.hash_password(password),
            is_verified=True,
            role=req.role,
            workspace=(req.workspace or "Default").strip() or "Default",
            is_active=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Email already exists") from exc

    created = _ensure_user(user_id)
    payload = _serialize_user(created)
    return {"user": payload, "generated_password": generated_password}


@router.put(
    "/{user_id}",
    response_model=AdminUserDetailResp,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def admin_users_update(
    user_id: int,
    req: AdminUserUpdateReq,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    _ensure_user(user_id)
    try:
        update_user_admin(
            user_id,
            full_name=req.full_name,
            email=req.email,
            workspace=(req.workspace.strip() if req.workspace is not None else None),
            is_active=req.is_active,
            role=req.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Email already exists") from exc

    refreshed = _ensure_user(user_id)
    return {"user": _serialize_user(refreshed)}


@router.post(
    "/{user_id}/password",
    response_model=AdminUserDetailResp,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def admin_users_set_password(
    user_id: int,
    req: AdminPasswordChangeReq,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    _ensure_user(user_id)
    update_password_hash(
        user_id,
        auth_module.hash_password(req.password),
        must_change_password=False,
    )
    refreshed = _ensure_user(user_id)
    return {"user": _serialize_user(refreshed)}


__all__ = ["router"]
