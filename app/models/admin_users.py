"""Models for admin user management endpoints."""

from __future__ import annotations

from typing import List, Optional

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, ValidationInfo, field_validator


class AdminUserSummary(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    access_group: Optional[str] = None
    workspace: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None


class AdminUserDetail(AdminUserSummary):
    pass


class AdminUsersListResp(BaseModel):
    users: List[AdminUserSummary]
    roles: List[str]


class AdminUserDetailResp(BaseModel):
    user: AdminUserDetail


class AdminUserCreateResp(AdminUserDetailResp):
    generated_password: Optional[str] = None


class AdminUserCreateReq(BaseModel):
    full_name: str = Field(..., min_length=1)
    email: str
    role: str
    workspace: Optional[str] = "Default"
    password: Optional[str] = None
    generate_password: Optional[bool] = False

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Full name is required")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class AdminUserUpdateReq(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    workspace: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Full name cannot be empty")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _normalize_email(value)


class AdminPasswordChangeReq(BaseModel):
    password: str
    confirm_password: str

    @field_validator("confirm_password")
    @classmethod
    def ensure_match(cls, confirm: str, info: ValidationInfo):
        password = info.data.get("password")
        if confirm != password:
            raise ValueError("Passwords do not match")
        if not password or len(password) < 8:
            raise ValueError("Password must be at least 8 characters")
        return confirm


def _normalize_email(value: str) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        raise ValueError("Email is required")
    try:
        info = validate_email(
            trimmed,
            allow_smtputf8=True,
            allow_quoted_local=True,
            allow_domain_literal=True,
            check_deliverability=False,
        )
        return info.normalized
    except EmailNotValidError as exc:  # pragma: no cover - passthrough
        lowered = trimmed.lower()
        if "@" in lowered:
            local_part, domain_part = lowered.rsplit("@", 1)
            if local_part and domain_part.endswith(".test"):
                return lowered
        raise ValueError(str(exc)) from exc


__all__ = [
    "AdminPasswordChangeReq",
    "AdminUserCreateReq",
    "AdminUserCreateResp",
    "AdminUserDetail",
    "AdminUserDetailResp",
    "AdminUserSummary",
    "AdminUserUpdateReq",
    "AdminUsersListResp",
]
