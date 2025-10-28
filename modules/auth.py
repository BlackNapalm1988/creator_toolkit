"""Authentication helpers for password hashing, JWT creation, and encryption."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Callable, Dict, Iterable, Optional

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from passlib.context import CryptContext

try:  # pragma: no cover - optional dependency shim
    from jose import jwt as jose_jwt
except ImportError:  # pragma: no cover
    jose_jwt = None

try:  # pragma: no cover
    import jwt as pyjwt  # type: ignore
except ImportError:  # pragma: no cover
    pyjwt = None

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


def _b64url_encode(data: bytes) -> str:
    """Return URL-safe base64 without padding."""

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    """Decode URL-safe base64 data, adding back stripped padding."""

    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _manual_jwt_encode(payload: Dict[str, Any], secret: str, algorithm: str) -> str:
    """Minimal HS256 JWT encoder used as a last-resort fallback."""

    if algorithm != "HS256":  # pragma: no cover - defensive guard
        raise ValueError("Unsupported algorithm for manual JWT encoder")

    header = {"alg": algorithm, "typ": "JWT"}
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    )

    signing_input = f"{header_segment}.{payload_segment}".encode()
    key_bytes = secret.encode("utf-8") if isinstance(secret, str) else secret
    signature = hmac.new(key_bytes, signing_input, hashlib.sha256).digest()
    signature_segment = _b64url_encode(signature)

    return ".".join([header_segment, payload_segment, signature_segment])


def _manual_jwt_decode(token: str, secret: str, algorithms: Iterable[str]) -> Dict[str, Any]:
    """Decode tokens produced by :func:`_manual_jwt_encode`."""

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT structure")

    header_segment, payload_segment, signature_segment = parts
    header_bytes = _b64url_decode(header_segment)
    payload_bytes = _b64url_decode(payload_segment)

    header = json.loads(header_bytes)
    payload = json.loads(payload_bytes)

    alg = header.get("alg")
    if algorithms and alg not in set(algorithms):
        raise ValueError("Unexpected JWT algorithm")

    key_bytes = secret.encode("utf-8") if isinstance(secret, str) else secret
    signing_input = f"{header_segment}.{payload_segment}".encode()
    expected_sig = hmac.new(key_bytes, signing_input, hashlib.sha256).digest()
    actual_sig = _b64url_decode(signature_segment)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid JWT signature")

    exp = payload.get("exp")
    if exp is not None and int(exp) < int(time.time()):
        raise ValueError("Token expired")

    return payload


if jose_jwt:  # pragma: no cover - exercised when dependency is installed

    def _jwt_encode(payload: Dict[str, Any], secret: str, algorithm: str) -> str:
        return jose_jwt.encode(payload, secret, algorithm=algorithm)


    def _jwt_decode(token: str, secret: str, algorithms: Iterable[str]) -> Dict[str, Any]:
        return jose_jwt.decode(token, secret, algorithms=list(algorithms))

elif pyjwt:  # pragma: no cover - exercised when dependency is installed

    def _jwt_encode(payload: Dict[str, Any], secret: str, algorithm: str) -> str:
        encoded = pyjwt.encode(payload, secret, algorithm=algorithm)
        if isinstance(encoded, bytes):
            encoded = encoded.decode("utf-8")
        return encoded


    def _jwt_decode(token: str, secret: str, algorithms: Iterable[str]) -> Dict[str, Any]:
        return pyjwt.decode(token, secret, algorithms=list(algorithms))

else:

    def _jwt_encode(payload: Dict[str, Any], secret: str, algorithm: str) -> str:
        return _manual_jwt_encode(payload, secret, algorithm)


    def _jwt_decode(token: str, secret: str, algorithms: Iterable[str]) -> Dict[str, Any]:
        return _manual_jwt_decode(token, secret, algorithms)


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
    return _jwt_encode(payload, JWT_SECRET, JWT_ALG)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode a JWT returning ``None`` if it is invalid/expired."""

    try:
        return _jwt_decode(token, JWT_SECRET, algorithms=[JWT_ALG])
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


def require_role(
    allowed_roles: Iterable[str],
    *,
    dependency: Callable = None,
    require_verified: bool = False,
):
    """Return a dependency ensuring the authenticated user has one of ``allowed_roles``.

    ``dependency`` should resolve the current user (defaults to raising an error if
    unspecified to avoid circular imports). The helper also supports enforcing email
    verification when ``require_verified`` is ``True``.
    """

    if dependency is None:
        raise RuntimeError("require_role dependency must be provided")

    allowed = {role.lower() for role in allowed_roles}

    def _checker(current_user=Depends(dependency)):
        role = (current_user.get("role") or "").lower()
        if require_verified and not current_user.get("is_verified"):
            raise HTTPException(status_code=403, detail="Email verification required")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
        return current_user

    return _checker
