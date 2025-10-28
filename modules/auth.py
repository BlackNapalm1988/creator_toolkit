# modules/auth.py
import os, time, hashlib
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from jose import jwt
from dotenv import load_dotenv
from cryptography.fernet import Fernet

load_dotenv()

PWD_CTX = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET      = os.getenv("JWT_SECRET", "dev_secret_change_me")
JWT_ALG         = "HS256"
JWT_EXPIRE_MIN  = int(os.getenv("JWT_EXPIRE_MIN", "43200"))
FERNET_SECRET   = os.getenv("FERNET_SECRET")
FERNET = Fernet(FERNET_SECRET.encode() if FERNET_SECRET and isinstance(FERNET_SECRET, str) else FERNET_SECRET) if FERNET_SECRET else None

def _pw_material(pw: str) -> str:
    # Pre-hash to avoid bcrypt 72-byte limit; hex string is 64 chars.
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def hash_password(pw: str) -> str:
    return PWD_CTX.hash(_pw_material(pw))

def verify_password(pw: str, pw_hash: str) -> bool:
    material = _pw_material(pw)
    # Try pre-hashed (new scheme) first
    ok = PWD_CTX.verify(material, pw_hash)
    if ok:
        return True
    # Backward compatibility: if you had any old hashes without prehashing
    try:
        return PWD_CTX.verify(pw, pw_hash)
    except Exception:
        return False

def create_access_token(user_id: int, email: str) -> str:
    now = int(time.time()); exp = now + JWT_EXPIRE_MIN * 60
    return jwt.encode({"sub": str(user_id), "email": email, "iat": now, "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        return None

def encrypt_value(plaintext: str) -> str:
    if not FERNET: raise RuntimeError("FERNET_SECRET not configured")
    return FERNET.encrypt(plaintext.encode()).decode()

def decrypt_value(ciphertext: str) -> str:
    if not FERNET: raise RuntimeError("FERNET_SECRET not configured")
    return FERNET.decrypt(ciphertext.encode()).decode()
