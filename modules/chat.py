"""SQLite-backed helpers for storing Imagine chat threads and messages."""

from __future__ import annotations

import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

CHAT_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chat.db")
os.makedirs(os.path.dirname(CHAT_DB), exist_ok=True)


def _conn() -> sqlite3.Connection:
    """Return a SQLite connection with ``check_same_thread`` disabled."""

    return sqlite3.connect(CHAT_DB, check_same_thread=False)


def init_chat_db() -> None:
    """Ensure the ``threads`` and ``messages`` tables exist."""

    with _conn() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT,
                model TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )"""
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)"
        )


def now() -> int:
    """Return the current Unix timestamp."""

    return int(time.time())


def create_thread(
    thread_id: str, user_id: int, model: str, title: str = "New chat"
) -> str:
    """Persist a new thread record and return its ID."""

    with _conn() as conn:
        conn.execute(
            "INSERT INTO threads (id, user_id, title, model, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (thread_id, user_id, title, model, now(), now()),
        )
    return thread_id


def get_thread(thread_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a thread row as a dictionary."""

    with _conn() as conn:
        row = conn.execute(
            "SELECT id, user_id, title, model, created_at, updated_at FROM threads WHERE id=?",
            (thread_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "user_id": row[1],
        "title": row[2],
        "model": row[3],
        "created_at": row[4],
        "updated_at": row[5],
    }


def list_threads(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    """Return the most recent threads belonging to ``user_id``."""

    with _conn() as conn:
        rows = conn.execute(
            """SELECT id, title, model, created_at, updated_at
            FROM threads
            WHERE user_id=?
            ORDER BY updated_at DESC
            LIMIT ?""",
            (user_id, limit),
        ).fetchall()
    return [
        {
            "id": row[0],
            "title": row[1],
            "model": row[2],
            "created_at": row[3],
            "updated_at": row[4],
        }
        for row in rows
    ]


def add_message(thread_id: str, role: str, content: str) -> None:
    """Append a message and update the thread ``updated_at`` timestamp."""

    with _conn() as conn:
        conn.execute(
            "INSERT INTO messages (thread_id, role, content, created_at) VALUES (?,?,?,?)",
            (thread_id, role, content, now()),
        )
        conn.execute(
            "UPDATE threads SET updated_at=? WHERE id=?",
            (now(), thread_id),
        )


def get_messages(thread_id: str, limit: int = 40) -> List[Dict[str, Any]]:
    """Return the most recent ``limit`` messages in chronological order."""

    with _conn() as conn:
        rows = conn.execute(
            """SELECT role, content, created_at
            FROM messages
            WHERE thread_id=?
            ORDER BY id DESC
            LIMIT ?""",
            (thread_id, limit),
        ).fetchall()
    rows = list(reversed(rows))
    return [
        {"role": role, "content": content, "created_at": created_at}
        for role, content, created_at in rows
    ]
