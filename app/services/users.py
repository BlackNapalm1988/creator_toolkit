"""User-facing helper utilities."""

from __future__ import annotations

def user_payload(user: dict) -> dict:
    """Return the subset of user columns that should be exposed externally."""

    role = (user.get("role") or "viewer").lower()
    return {
        "id": user["id"],
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "access_group": user.get("access_group", "User"),
        "is_verified": bool(user.get("is_verified")),
        "role": role,
        "must_change_password": bool(user.get("must_change_password")),
    }


__all__ = ["user_payload"]
