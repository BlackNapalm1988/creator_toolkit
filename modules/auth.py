"""Authentication helpers for password hashing, JWT creation, and encryption."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from jose import jwt
from passlib.context import CryptContext

load_dotenv()

PWD_CTX = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "dev_secret_change_me")
JWT_ALG = "HS256"
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "43200"))

FERNET_SECRET = os.getenv("FERNET_SECRET")
if FERNET_SECRET:
    secret_bytes = FERNET_SECRET.encode() if isinstance(FERNET_SECRET, str) else FERNET_SECRET
    FERNET = Fernet(secret_bytes)
else:
    FERNET = None


def _pw_material(pw: str) -> str:
    """Return deterministic sha256 hex digest to avoid bcrypt's 72 byte cap."""

    return hashlib.sha256(pw.encode("utf-8")).hexdigest()


def hash_password(pw: str) -> str:
    """Hash a password string using bcrypt (after pre-hashing)."""

    return PWD_CTX.hash(_pw_material(pw))


def verify_password(pw: str, pw_hash: str) -> bool:
    """Validate a password against a stored hash with legacy fallback."""

    material = _pw_material(pw)

    # Try the preferred scheme (sha256 pre-hash + bcrypt) first.
    if PWD_CTX.verify(material, pw_hash):
        return True

    # Backward compatibility: if any old hashes were stored without pre-hashing
    # keep them working until they can be rotated.
    try:
        return PWD_CTX.verify(pw, pw_hash)
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
    except Exception:
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
