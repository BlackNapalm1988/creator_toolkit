import os
import sqlite3
import time
from typing import Optional, Dict, Any, Iterable, Tuple

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "auth.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_db():
    with _conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                access_group TEXT NOT NULL DEFAULT 'User',
                is_verified INTEGER NOT NULL DEFAULT 0,
                verification_code TEXT,
                verified_at INTEGER
            )"""
        )
        c.execute(
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
            c,
            "users",
            [
                ("access_group", "TEXT NOT NULL DEFAULT 'User'"),
                ("is_verified", "INTEGER NOT NULL DEFAULT 0"),
                ("verification_code", "TEXT"),
                ("verified_at", "INTEGER"),
            ],
        )


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: Iterable[Tuple[str, str]]):
    existing = {
        row[1] for row in conn.execute(f"PRAGMA table_info({table})")  # type: ignore[arg-type]
    }
    for name, ddl in columns:
        if name in existing:
            continue
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def _row_to_user(row) -> Dict[str, Any]:
    return {
        "id": row[0],
        "email": row[1],
        "full_name": row[2],
        "password_hash": row[3],
        "created_at": row[4],
        "access_group": row[5] if len(row) > 5 else "User",
        "is_verified": bool(row[6]) if len(row) > 6 else False,
        "verification_code": row[7] if len(row) > 7 else None,
        "verified_at": row[8] if len(row) > 8 else None,
    }


def create_user(
    email: str,
    full_name: str,
    password_hash: str,
    *,
    access_group: str = "User",
    is_verified: bool = False,
    verification_code: Optional[str] = None,
) -> int:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO users (
                email,
                full_name,
                password_hash,
                created_at,
                access_group,
                is_verified,
                verification_code,
                verified_at
            ) VALUES (?,?,?,?,?,?,?,?)""",
            (
                email.lower().strip(),
                full_name.strip(),
                password_hash,
                int(time.time()),
                access_group,
                1 if is_verified else 0,
                verification_code,
                int(time.time()) if is_verified else None,
            ),
        )
        return cur.lastrowid


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute(
            """SELECT
                id,
                email,
                full_name,
                password_hash,
                created_at,
                access_group,
                is_verified,
                verification_code,
                verified_at
            FROM users WHERE email=?""",
            (email.lower().strip(),),
        ).fetchone()
        if not row:
            return None
        return _row_to_user(row)


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute(
            """SELECT
                id,
                email,
                full_name,
                password_hash,
                created_at,
                access_group,
                is_verified,
                verification_code,
                verified_at
            FROM users WHERE id=?""",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return _row_to_user(row)


def update_user_profile(user_id: int, full_name: str, email: str):
    with _conn() as c:
        c.execute(
            "UPDATE users SET full_name=?, email=? WHERE id=?",
            (full_name.strip(), email.lower().strip(), user_id),
        )


def update_password_hash(user_id: int, password_hash: str):
    with _conn() as c:
        c.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash, user_id))


def upsert_user_key(user_id: int, provider: str, key_cipher: str):
    with _conn() as c:
        c.execute(
            """INSERT INTO user_keys (user_id, provider, key_cipher, created_at)
                     VALUES (?,?,?,?)
                     ON CONFLICT(user_id, provider) DO UPDATE SET key_cipher=excluded.key_cipher""",
            (user_id, provider, key_cipher, int(time.time())),
        )


def list_user_keys(user_id: int) -> Dict[str, str]:
    with _conn() as c:
        rows = c.execute(
            "SELECT provider, key_cipher FROM user_keys WHERE user_id=?",
            (user_id,),
        ).fetchall()
        return {r[0]: r[1] for r in rows}


def delete_user_key(user_id: int, provider: str):
    with _conn() as c:
        c.execute("DELETE FROM user_keys WHERE user_id=? AND provider=?", (user_id, provider))


def set_verification_code(user_id: int, code: str):
    with _conn() as c:
        c.execute(
            "UPDATE users SET verification_code=?, is_verified=0, verified_at=NULL WHERE id=?",
            (code, user_id),
        )


def mark_email_verified(user_id: int):
    with _conn() as c:
        c.execute(
            "UPDATE users SET is_verified=1, verification_code=NULL, verified_at=? WHERE id=?",
            (int(time.time()), user_id),
        )


def update_access_group(user_id: int, access_group: str):
    with _conn() as c:
        c.execute("UPDATE users SET access_group=? WHERE id=?", (access_group, user_id))
