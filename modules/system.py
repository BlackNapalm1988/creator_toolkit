"""System configuration helpers (SMTP, etc.)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict

from modules import auth as auth_module

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "system_config.json")
os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)


def _read_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        return {}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def _write_config(data: Dict[str, Any]) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def _env_smtp_settings() -> Dict[str, Any]:
    return {
        "host": os.getenv("SMTP_HOST") or "",
        "port": int(os.getenv("SMTP_PORT") or 0),
        "use_tls": (os.getenv("SMTP_USE_TLS", "1").strip().lower() in {"1", "true", "yes"}),
        "username": os.getenv("SMTP_USER") or "",
        "password": os.getenv("SMTP_PASSWORD") or "",
        "from_address": os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USER") or "",
    }


def load_smtp_config() -> Dict[str, Any]:
    """Return the persisted SMTP configuration (without applying defaults)."""

    data = _read_config()
    raw = data.get("smtp") or {}
    return {
        "host": raw.get("host", ""),
        "port": int(raw.get("port") or 0),
        "use_tls": bool(raw.get("use_tls", True)),
        "username": raw.get("username", ""),
        "password_cipher": raw.get("password_cipher"),
        "password_plain": raw.get("password_plain"),
        "from_address": raw.get("from_address", ""),
    }


def save_smtp_config(config: Dict[str, Any]) -> None:
    """Persist SMTP settings to disk."""

    payload = _read_config()
    payload["smtp"] = config
    _write_config(payload)


def resolve_smtp_settings() -> Dict[str, Any]:
    """Return the effective SMTP settings used for outbound email."""

    stored = load_smtp_config()
    if stored.get("host"):
        password = None
        if stored.get("password_cipher"):
            try:
                password = auth_module.decrypt_value(stored["password_cipher"])
            except Exception:
                password = None
        elif stored.get("password_plain"):
            password = stored["password_plain"]
        return {
            "host": stored.get("host", ""),
            "port": int(stored.get("port") or 0),
            "use_tls": bool(stored.get("use_tls", True)),
            "username": stored.get("username", ""),
            "password": password or "",
            "from_address": stored.get("from_address") or stored.get("username") or "",
        }

    return _env_smtp_settings()


def get_public_smtp_settings() -> Dict[str, Any]:
    """Return SMTP settings safe for API exposure (password masked)."""

    effective = resolve_smtp_settings()
    stored = load_smtp_config()
    password_set = bool(effective.get("password")) or bool(
        stored.get("password_cipher") or stored.get("password_plain")
    )
    masked_password = "********" if password_set else ""
    return {
        "host": effective.get("host", ""),
        "port": effective.get("port", 0),
        "use_tls": bool(effective.get("use_tls", True)),
        "username": effective.get("username", ""),
        "from_address": effective.get("from_address", ""),
        "password_mask": masked_password,
        "password_set": password_set,
        "configured_via_env": not stored.get("host"),
    }


def update_smtp_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and save SMTP settings. Returns stored representation."""

    host = (payload.get("host") or "").strip()
    username = (payload.get("username") or "").strip()
    from_address = (payload.get("from_address") or "").strip() or username
    use_tls = bool(payload.get("use_tls", True))

    try:
        port = int(payload.get("port") or 0)
    except (TypeError, ValueError):
        raise ValueError("port must be an integer") from None

    password = payload.get("password")
    config: Dict[str, Any] = {
        "host": host,
        "port": port,
        "use_tls": use_tls,
        "username": username,
        "from_address": from_address,
    }

    if password is not None:
        password = str(password)
        if password:
            if auth_module.FERNET:
                config["password_cipher"] = auth_module.encrypt_value(password)
                config.pop("password_plain", None)
            else:
                config["password_plain"] = password
                config.pop("password_cipher", None)
        else:
            config.pop("password_cipher", None)
            config.pop("password_plain", None)
    else:
        existing = load_smtp_config()
        if existing.get("password_cipher"):
            config["password_cipher"] = existing["password_cipher"]
        elif existing.get("password_plain"):
            config["password_plain"] = existing["password_plain"]

    save_smtp_config(config)
    return config
