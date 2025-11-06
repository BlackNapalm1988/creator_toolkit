"""Authentication-related helpers."""

from __future__ import annotations

import logging
import secrets
import smtplib
from email.message import EmailMessage

from app.core.settings import get_settings
from modules.system import resolve_smtp_settings

logger = logging.getLogger(__name__)


def generate_verification_code() -> str:
    """Return a random six-digit verification code as a string."""

    return f"{secrets.randbelow(900000) + 100000}"


def send_verification_email(
    recipient: str, code: str, full_name: str | None = None
) -> bool:
    """Send a verification code email using the configured SMTP settings."""

    smtp_settings = resolve_smtp_settings()
    smtp_host = smtp_settings.get("host")
    smtp_port = int(smtp_settings.get("port") or 0)
    smtp_user = smtp_settings.get("username")
    smtp_password = smtp_settings.get("password")
    smtp_from = smtp_settings.get("from_address") or smtp_user
    smtp_use_tls = bool(smtp_settings.get("use_tls", True))

    timeout = get_settings().smtp_timeout_seconds

    if not recipient:
        logger.warning("No recipient provided for verification email; skipping send")
        return False

    if not smtp_host or not smtp_from:
        logger.warning(
            "SMTP not configured; verification code for %s is %s", recipient, code
        )
        return False

    msg = EmailMessage()
    friendly_name = full_name or recipient
    msg["Subject"] = "Your Creator Toolkit verification code"
    msg["From"] = smtp_from
    msg["To"] = recipient
    body = (
        f"Hi {friendly_name},\n\n"
        "Here is your Creator Toolkit verification code: "
        f"{code}\n\n"
        "Enter this code in the dashboard to unlock API features.\n\n"
        "If you did not request this code, you can ignore this email."
    )
    msg.set_content(body)

    try:
        with smtplib.SMTP(smtp_host, smtp_port or 0, timeout=timeout) as smtp:
            if smtp_use_tls:
                try:
                    smtp.starttls()
                except smtplib.SMTPException:
                    logger.debug(
                        "SMTP server did not accept STARTTLS; continuing without TLS"
                    )
            if smtp_user and smtp_password:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
        logger.info("Sent verification email to %s", recipient)
        return True
    except Exception as exc:  # pragma: no cover - network dependent
        logger.warning("Could not send verification email to %s: %s", recipient, exc)
        return False


__all__ = ["generate_verification_code", "send_verification_email"]
