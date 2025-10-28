"""SQLite-backed lightweight job queue used by the Creator Toolkit."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import traceback
import uuid
from typing import Any, Callable, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jobs.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _conn() -> sqlite3.Connection:
    """Return a SQLite connection for the job queue database."""

    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_jobs_db() -> None:
    """Create the ``jobs`` table if it does not already exist."""

    with _conn() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL,
                result TEXT,
                error TEXT,
                logs TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")


def now() -> int:
    """Return the current Unix timestamp."""

    return int(time.time())


def new_id(prefix: str) -> str:
    """Generate a unique job identifier with the provided ``prefix``."""

    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def enqueue(job_type: str, payload: Dict[str, Any]) -> str:
    """Persist a job in ``queued`` state and return the job ID."""

    job_id = new_id(job_type)
    with _conn() as conn:
        conn.execute(
            """INSERT INTO jobs (id, type, payload, status, progress, result, error, logs, created_at, updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (job_id, job_type, json.dumps(payload), "queued", 0, None, None, "", now(), now()),
        )
    return job_id


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a job record by ID."""

    with _conn() as conn:
        row = conn.execute(
            "SELECT id, type, payload, status, progress, result, error, logs, created_at, updated_at FROM jobs WHERE id=?",
            (job_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "type": row[1],
        "payload": json.loads(row[2]),
        "status": row[3],
        "progress": row[4],
        "result": json.loads(row[5]) if row[5] else None,
        "error": row[6],
        "logs": row[7],
        "created_at": row[8],
        "updated_at": row[9],
    }


def list_jobs(limit: int = 50) -> List[Dict[str, Any]]:
    """Return the most recently created jobs."""

    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, type, status, progress, created_at, updated_at FROM jobs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": row[0],
            "type": row[1],
            "status": row[2],
            "progress": row[3],
            "created_at": row[4],
            "updated_at": row[5],
        }
        for row in rows
    ]


def _update(job_id: str, **kwargs: Any) -> None:
    """Utility for updating a job row while touching ``updated_at``."""

    sets: List[str] = []
    params: List[Any] = []
    for key, value in kwargs.items():
        if key in {"payload", "result"} and value is not None:
            value = json.dumps(value)
        sets.append(f"{key}=?")
        params.append(value)
    sets.append("updated_at=?")
    params.append(now())
    with _conn() as conn:
        conn.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id=?", (*params, job_id))


def set_status(job_id: str, status: str) -> None:
    """Update the job ``status`` field."""

    _update(job_id, status=status)


def set_progress(job_id: str, progress: int) -> None:
    """Update ``progress`` while clamping it between 0 and 100."""

    _update(job_id, progress=max(0, min(100, int(progress))))


def append_log(job_id: str, line: str) -> None:
    """Append a line to the job log with simple truncation."""

    with _conn() as conn:
        row = conn.execute("SELECT logs FROM jobs WHERE id=?", (job_id,)).fetchone()
        previous = row[0] or ""
        new_logs = (previous + ("\n" if previous else "") + line)[:20000]
        conn.execute("UPDATE jobs SET logs=?, updated_at=? WHERE id=?", (new_logs, now(), job_id))


def set_result(job_id: str, result: Dict[str, Any]) -> None:
    """Persist a successful result payload."""

    _update(job_id, result=result, status="done", progress=100)


def set_error(job_id: str, error: str) -> None:
    """Record an error state for the job."""

    _update(job_id, error=error, status="error", progress=100)


class QueueWorker(threading.Thread):
    """Simple polling worker that processes queued jobs in FIFO order."""

    def __init__(
        self,
        handlers: Dict[str, Callable[[str, Dict[str, Any]], None]],
        poll_interval: float = 0.8,
    ) -> None:
        super().__init__(daemon=True)
        self.handlers = handlers
        self.poll_interval = poll_interval
        self.running = True

    def run(self) -> None:  # pragma: no cover - thread loop is hard to unit test
        while self.running:
            try:
                with _conn() as conn:
                    row = conn.execute(
                        "SELECT id, type, payload FROM jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1"
                    ).fetchone()
                    if not row:
                        time.sleep(self.poll_interval)
                        continue
                    job_id, job_type, payload_json = row
                    conn.execute(
                        "UPDATE jobs SET status='running', updated_at=? WHERE id=?",
                        (now(), job_id),
                    )

                payload = json.loads(payload_json)
                handler = self.handlers.get(job_type)
                if not handler:
                    set_error(job_id, f"No handler for job type '{job_type}'")
                    continue

                append_log(job_id, f"Starting job {job_id} ({job_type})")
                try:
                    handler(job_id, payload)
                except Exception as exc:  # pragma: no cover - defensive logging
                    append_log(job_id, traceback.format_exc())
                    set_error(job_id, f"{type(exc).__name__}: {exc}")
            except Exception:
                time.sleep(self.poll_interval)

    def stop(self) -> None:
        """Signal the worker loop to exit on the next iteration."""

        self.running = False
