"""Admin-only system endpoints (SMTP settings, etc.)."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException

from app.core.settings import get_settings
from app.deps import require_role
from app.models.api import ErrorResponse, OkResp
from app.models.system import SMTPConfigUpdate, SMTPTestRequest
from modules.system import (
    get_public_smtp_settings,
    resolve_smtp_settings,
    update_smtp_settings,
)

router = APIRouter(prefix="/admin/system", tags=["Admin"])


@router.get("/smtp", responses={403: {"model": ErrorResponse}})
def admin_get_smtp_settings(
    user=Depends(require_role(["admin"], require_verified=True)),
):
    return get_public_smtp_settings()


@router.post("/smtp", response_model=OkResp, responses={400: {"model": ErrorResponse}})
def admin_update_smtp_settings(
    config: SMTPConfigUpdate,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    payload = config.model_dump(exclude_unset=True)
    payload = {k: v for k, v in payload.items() if v is not None}
    try:
        update_smtp_settings(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    refreshed = get_public_smtp_settings()
    return {"ok": True, "settings": refreshed}


@router.post(
    "/smtp/test", response_model=OkResp, responses={400: {"model": ErrorResponse}}
)
def admin_test_smtp(
    req: SMTPTestRequest,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    settings = resolve_smtp_settings()
    host = settings.get("host")
    from_address = settings.get("from_address") or settings.get("username")
    if not host or not from_address:
        raise HTTPException(status_code=400, detail="SMTP configuration incomplete")

    msg = EmailMessage()
    msg["Subject"] = req.subject or "Creator Toolkit SMTP Test"
    msg["From"] = from_address
    msg["To"] = req.to
    msg.set_content(req.body or "This is a test email from Creator Toolkit.")

    timeout_seconds = get_settings().smtp_timeout_seconds

    try:
        with smtplib.SMTP(
            host, int(settings.get("port") or 0), timeout=timeout_seconds
        ) as smtp:
            if bool(settings.get("use_tls", True)):
                try:
                    smtp.starttls()
                except smtplib.SMTPException:
                    # Server may not support STARTTLS; continue without it
                    pass
            username = settings.get("username")
            password = settings.get("password")
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP send failed: {exc}") from exc

    return {"ok": True}


__all__ = ["router"]
