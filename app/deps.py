"""Shared dependency helpers for the Creator Toolkit API."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from modules.auth import decode_access_token
from modules.auth import require_role as base_require_role
from modules.users import get_user_by_id

auth_scheme = HTTPBearer(auto_error=False)


def current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(auth_scheme)],
):
    """Resolve the authenticated user based on bearer token or cookie."""

    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    if not token:
        token = request.cookies.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    if token.startswith("Bearer "):
        token = token[len("Bearer ") :]

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    uid_raw = payload.get("sub") or payload.get("id")
    if uid_raw is None:
        raise HTTPException(status_code=401, detail="Token missing 'sub' or 'id'")

    try:
        uid = int(uid_raw)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=401, detail="Bad id in token") from exc

    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if "email" not in user and payload.get("email"):
        user["email"] = payload["email"]

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")

    return user


def require_role(allowed_roles, *, require_verified: bool = False):
    """Return dependency enforcing a user's role (and optional verification)."""

    return base_require_role(
        allowed_roles,
        dependency=current_user,
        require_verified=require_verified,
    )


def verified_user(user: Annotated[dict, Depends(current_user)]):
    """Dependency that requires the user to have completed email verification."""

    if not user.get("is_verified"):
        raise HTTPException(status_code=403, detail="Email verification required")
    return user


def dev_user(user: Annotated[dict, Depends(verified_user)]):
    """Dependency restricting access to members of the ``Dev`` access group."""

    if (user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


__all__ = [
    "auth_scheme",
    "current_user",
    "require_role",
    "verified_user",
    "dev_user",
]
