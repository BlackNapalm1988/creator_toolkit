"""Pydantic models for authentication and system endpoints."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr


class RegisterReq(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdateReq(BaseModel):
    full_name: str
    email: EmailStr


class PasswordChangeReq(BaseModel):
    current_password: str
    new_password: str


class KeyUpsertReq(BaseModel):
    provider: str
    secret: str


class VerifyEmailReq(BaseModel):
    code: str


class RoleUpdateReq(BaseModel):
    role: str
    user_id: Optional[int] = None


class SMTPConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    use_tls: Optional[bool] = True
    username: Optional[str] = None
    password: Optional[str] = None
    from_address: Optional[str] = None


class SMTPTestRequest(BaseModel):
    to: EmailStr
    subject: Optional[str] = "Creator Toolkit SMTP Test"
    body: Optional[str] = "This is a test email from Creator Toolkit."


__all__ = [
    "KeyUpsertReq",
    "LoginReq",
    "PasswordChangeReq",
    "ProfileUpdateReq",
    "RegisterReq",
    "RoleUpdateReq",
    "SMTPConfigUpdate",
    "SMTPTestRequest",
    "VerifyEmailReq",
]
