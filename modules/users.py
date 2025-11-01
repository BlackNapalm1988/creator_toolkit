"""User management helpers backed by SQLite."""

from __future__ import annotations

import os
import sqlite3
import time
from typing import Any, Dict, Iterable, Optional, Tuple

VALID_ROLES = {"admin", "owner", "editor", "viewer"}
DEFAULT_ROLE = "owner"

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "auth.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _conn() -> sqlite3.Connection:
    """Return a SQLite connection with ``check_same_thread`` disabled."""

    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_db() -> None:
    """Provision the ``users`` and ``user_keys`` tables."""

    with _conn() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                access_group TEXT NOT NULL DEFAULT 'User',
                is_verified INTEGER NOT NULL DEFAULT 0,
                verification_code TEXT,
                verified_at INTEGER,
                role TEXT NOT NULL DEFAULT 'owner',
                must_change_password INTEGER NOT NULL DEFAULT 0
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS user_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                key_cipher TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, provider)
            )"""
        )
        _ensure_columns(
            conn,
            "users",
            [
                ("access_group", "TEXT NOT NULL DEFAULT 'User'"),
                ("is_verified", "INTEGER NOT NULL DEFAULT 0"),
                ("verification_code", "TEXT"),
                ("verified_at", "INTEGER"),
                ("role", "TEXT NOT NULL DEFAULT 'owner'"),
                ("must_change_password", "INTEGER NOT NULL DEFAULT 0"),
            ],
        )


def _ensure_columns(
    conn: sqlite3.Connection, table: str, columns: Iterable[Tuple[str, str]]
) -> None:
    """Backfill optional columns that may be missing in older databases."""

    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, ddl in columns:
        if name in existing:
            continue
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def _row_to_user(row: sqlite3.Row | Tuple[Any, ...]) -> Dict[str, Any]:
    """Normalize a SQLite row to a dict used by the API layer."""

    access_group = row[5] if len(row) > 5 else "User"
    role = row[9] if len(row) > 9 else None
    if not role:
        upper_group = (access_group or "").strip().lower()
        if upper_group == "dev":
            role = "admin"
        else:
            role = DEFAULT_ROLE

    return {
        "id": row[0],
        "email": row[1],
        "full_name": row[2],
        "password_hash": row[3],
        "created_at": row[4],
        "access_group": access_group,
        "is_verified": bool(row[6]) if len(row) > 6 else False,
        "verification_code": row[7] if len(row) > 7 else None,
        "verified_at": row[8] if len(row) > 8 else None,
        "role": role,
        "must_change_password": bool(row[10]) if len(row) > 10 else False,
    }


def create_user(
    email: str,
    full_name: str,
    password_hash: str,
    *,
    access_group: str = "User",
    is_verified: bool = False,
    verification_code: Optional[str] = None,
    role: str = DEFAULT_ROLE,
    must_change_password: bool = False,
) -> int:
    """Insert a new user and return its generated ID."""

    normalized_role = role.lower()
    if normalized_role not in VALID_ROLES:
        normalized_role = DEFAULT_ROLE

    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO users (
                email,
                full_name,
                password_hash,
                created_at,
                access_group,
                is_verified,
                verification_code,
                verified_at,
                role,
                must_change_password
            ) VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                email.lower().strip(),
                full_name.strip(),
                password_hash,
                int(time.time()),
                access_group,
                1 if is_verified else 0,
                verification_code,
                int(time.time()) if is_verified else None,
                normalized_role,
                1 if must_change_password else 0,
            ),
        )
        return cur.lastrowid


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Return the user matching ``email`` or ``None`` if not found."""

    with _conn() as conn:
        row = conn.execute(
            """SELECT
                id,
                email,
                full_name,
                password_hash,
                created_at,
                access_group,
                is_verified,
                verification_code,
                verified_at,
                role,
                must_change_password
            FROM users WHERE email=?""",
            (email.lower().strip(),),
        ).fetchone()
    return _row_to_user(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Return the user matching ``user_id`` or ``None`` if missing."""

    with _conn() as conn:
        row = conn.execute(
            """SELECT
                id,
                email,
                full_name,
                password_hash,
                created_at,
                access_group,
                is_verified,
                verification_code,
                verified_at,
                role,
                must_change_password
            FROM users WHERE id=?""",
            (user_id,),
        ).fetchone()
    return _row_to_user(row) if row else None


def update_user_profile(user_id: int, full_name: str, email: str) -> None:
    """Update the ``full_name`` and ``email`` for the given user."""

    with _conn() as conn:
        conn.execute(
            "UPDATE users SET full_name=?, email=? WHERE id=?",
            (full_name.strip(), email.lower().strip(), user_id),
        )


def update_password_hash(
    user_id: int,
    password_hash: str,
    *,
    must_change_password: Optional[bool] = None,
) -> None:
    """Replace a user's password hash and optionally update rotation flag."""

    with _conn() as conn:
        if must_change_password is None:
            conn.execute(
                "UPDATE users SET password_hash=? WHERE id=?",
                (password_hash, user_id),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash=?, must_change_password=? WHERE id=?",
                (password_hash, 1 if must_change_password else 0, user_id),
            )


def upsert_user_key(user_id: int, provider: str, key_cipher: str) -> None:
    """Insert or update an encrypted API key for ``provider``."""

    with _conn() as conn:
        conn.execute(
            """INSERT INTO user_keys (user_id, provider, key_cipher, created_at)
                     VALUES (?,?,?,?)
                     ON CONFLICT(user_id, provider) DO UPDATE SET key_cipher=excluded.key_cipher""",
            (user_id, provider, key_cipher, int(time.time())),
        )


def list_user_keys(user_id: int) -> Dict[str, str]:
    """Return a mapping of provider -> encrypted key for the user."""

    with _conn() as conn:
        rows = conn.execute(
            "SELECT provider, key_cipher FROM user_keys WHERE user_id=?",
            (user_id,),
        ).fetchall()
    return {provider: key for provider, key in rows}


def delete_user_key(user_id: int, provider: str) -> None:
    """Remove a stored key for ``provider``."""

    with _conn() as conn:
        conn.execute(
            "DELETE FROM user_keys WHERE user_id=? AND provider=?",
            (user_id, provider),
        )


def set_verification_code(user_id: int, code: str) -> None:
    """Store a one-time verification code for the user."""

    with _conn() as conn:
        conn.execute(
            "UPDATE users SET verification_code=?, is_verified=0, verified_at=NULL WHERE id=?",
            (code, user_id),
        )


def mark_email_verified(user_id: int) -> None:
    """Mark a user's email as verified and clear the stored code."""

    with _conn() as conn:
        conn.execute(
            "UPDATE users SET is_verified=1, verification_code=NULL, verified_at=? WHERE id=?",
            (int(time.time()), user_id),
        )


def update_access_group(user_id: int, access_group: str) -> None:
    """Set a user's access group (e.g. ``User`` or ``Dev``)."""

    with _conn() as conn:
        conn.execute(
            "UPDATE users SET access_group=? WHERE id=?",
            (access_group, user_id),
        )
        lowered = (access_group or "").strip().lower()
        if lowered == "dev":
            conn.execute("UPDATE users SET role='admin' WHERE id=?", (user_id,))
        elif lowered == "user":
            conn.execute("UPDATE users SET role=? WHERE id=?", (DEFAULT_ROLE, user_id))


def update_role(user_id: int, role: str) -> None:
    """Set a user's role within the RBAC system."""

    normalized = role.lower()
    if normalized not in VALID_ROLES:
        raise ValueError(f"Invalid role '{role}'")

    with _conn() as conn:
        access_group = "Dev" if normalized == "admin" else "User"
        conn.execute(
            "UPDATE users SET role=?, access_group=? WHERE id=?",
            (normalized, access_group, user_id),
        )


def set_must_change_password(user_id: int, flag: bool) -> None:
    """Toggle the password rotation requirement for a user."""

    with _conn() as conn:
        conn.execute(
            "UPDATE users SET must_change_password=? WHERE id=?",
            (1 if flag else 0, user_id),
        )


def count_users() -> int:
    """Return the number of users currently stored."""

    with _conn() as conn:
        row = conn.execute("SELECT COUNT(*) FROM users").fetchone()
    return int(row[0]) if row else 0
