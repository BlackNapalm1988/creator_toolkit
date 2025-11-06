"""Authentication helpers for password hashing, JWT creation, and encryption."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any, Callable, Dict, Iterable, Optional

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.settings import get_settings

PWD_CTX = CryptContext(schemes=["bcrypt"], deprecated="auto")

settings = get_settings()

JWT_SECRET = settings.jwt_secret
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "43200"))

FERNET_SECRET = os.getenv("FERNET_SECRET")
if FERNET_SECRET:
    secret_bytes = (
        FERNET_SECRET.encode() if isinstance(FERNET_SECRET, str) else FERNET_SECRET
    )
    FERNET = Fernet(secret_bytes)
else:
    FERNET = None


def _pw_material(password: str) -> str:
    """Return deterministic sha256 hex digest to avoid bcrypt's 72 byte cap."""

    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password string using bcrypt (after pre-hashing)."""

    return PWD_CTX.hash(_pw_material(password))


def verify_password(password: str, pw_hash: str) -> bool:
    """Validate a password against a stored hash with legacy fallback."""

    material = _pw_material(password)

    if PWD_CTX.verify(material, pw_hash):
        return True

    try:
        return PWD_CTX.verify(password, pw_hash)
    except Exception:
        return False


def create_access_token(user_id: int, email: str) -> str:
    """Create a short-lived JWT embedding minimal user identity."""

    now = int(time.time())
    exp = now + JWT_EXPIRE_MIN * 60
    payload = {"sub": str(user_id), "email": email, "iat": now, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode a JWT returning ``None`` if it is invalid/expired."""

    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        return None


def encrypt_value(plaintext: str) -> str:
    """Encrypt a sensitive value using Fernet symmetric encryption."""

    if not FERNET:
        raise RuntimeError("FERNET_SECRET not configured")
    return FERNET.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a value previously returned by :func:`encrypt_value`."""

    if not FERNET:
        raise RuntimeError("FERNET_SECRET not configured")
    return FERNET.decrypt(ciphertext.encode()).decode()


def require_role(
    allowed_roles: Iterable[str],
    *,
    dependency: Callable,
    require_verified: bool = False,
):
    """Return a dependency ensuring the authenticated user has the required role."""

    allowed = {role.lower() for role in allowed_roles}

    def _checker(current_user=Depends(dependency)) -> Dict[str, Any]:  # noqa: B008
        role = (current_user.get("role") or "").lower()
        if require_verified and not current_user.get("is_verified"):
            raise HTTPException(status_code=403, detail="Email verification required")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
        return current_user

    return _checker
