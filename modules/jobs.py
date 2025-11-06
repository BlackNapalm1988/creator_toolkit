"""SQLite-backed lightweight job queue used by the Creator Toolkit."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import traceback
import uuid
from typing import Any, Callable, Dict, Iterable, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jobs.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,
    progress INTEGER,
    result TEXT,
    error_message TEXT,
    logs TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    duration_ms INTEGER,
    project_id TEXT
)
"""


UNSET = object()


def _conn() -> sqlite3.Connection:
    """Return a SQLite connection for the job queue database."""

    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_jobs_db() -> None:
    """Ensure the ``jobs`` table exists with the expected columns."""

    with _conn() as conn:
        existing_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'"
        ).fetchone()

        if not existing_table:
            conn.execute(CREATE_TABLE_SQL)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at)"
            )
            return

        info_rows = conn.execute("PRAGMA table_info(jobs)").fetchall()
        columns = {row[1]: row for row in info_rows}

        progress_not_nullable = columns.get("progress", (None, None, None, 0))[3] == 1
        missing_stage = "stage" not in columns
        missing_error_message = "error_message" not in columns
        missing_duration = "duration_ms" not in columns
        missing_project = "project_id" not in columns
        legacy_error_column = "error" in columns and missing_error_message

        needs_migration = (
            progress_not_nullable
            or missing_stage
            or missing_error_message
            or missing_duration
            or missing_project
        )

        if needs_migration:
            conn.execute("ALTER TABLE jobs RENAME TO jobs_legacy")
            conn.execute(CREATE_TABLE_SQL)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at)"
            )

            stage_select = "stage" if not missing_stage else "status"
            error_select = "error" if legacy_error_column else "error_message"

            conn.execute(
                f"""
                INSERT INTO jobs (
                    id, type, payload, status, stage, progress, result,
                    error_message, logs, created_at, updated_at, duration_ms, project_id
                )
                SELECT
                    id,
                    type,
                    payload,
                    status,
                    {stage_select} AS stage,
                    progress,
                    result,
                    {error_select} AS error_message,
                    logs,
                    created_at,
                    updated_at,
                    NULL AS duration_ms,
                    NULL AS project_id
                FROM jobs_legacy
                """
            )
            conn.execute("DROP TABLE jobs_legacy")
        else:
            # ensure indexes exist for existing installs
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at)"
            )


def now() -> int:
    """Return the current Unix timestamp."""

    return int(time.time())


def new_id(prefix: str) -> str:
    """Generate a unique job identifier with the provided ``prefix``."""

    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def enqueue(
    job_type: str, payload: Dict[str, Any], *, project_id: str | None = None
) -> str:
    """Persist a job in ``queued`` state and return the job ID."""

    job_id = new_id(job_type)
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO jobs (
                id, type, payload, status, stage, progress, result,
                error_message, logs, created_at, updated_at, duration_ms, project_id
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                job_id,
                job_type,
                json.dumps(payload),
                "queued",
                "queued",
                0,
                None,
                None,
                "",
                now(),
                now(),
                None,
                project_id,
            ),
        )
    return job_id


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a job record by ID."""

    with _conn() as conn:
        row = conn.execute(
            """
            SELECT
                id,
                type,
                payload,
                status,
                stage,
                progress,
                result,
                error_message,
                logs,
                created_at,
                updated_at,
                duration_ms,
                project_id
            FROM jobs
            WHERE id=?
            """,
            (job_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "type": row[1],
        "payload": json.loads(row[2]),
        "status": row[3],
        "stage": row[4],
        "progress": row[5],
        "result": json.loads(row[6]) if row[6] else None,
        "error_message": row[7],
        "logs": row[8],
        "created_at": row[9],
        "updated_at": row[10],
        "duration_ms": row[11],
        "project_id": row[12],
    }


def list_jobs(
    limit: int = 50, statuses: Optional[Iterable[str]] = None
) -> List[Dict[str, Any]]:
    """Return recent jobs optionally filtered by ``statuses``."""

    query = (
        "SELECT id, type, status, stage, progress, error_message, created_at, updated_at, duration_ms "
        "FROM jobs"
    )
    params: List[Any] = []
    if statuses:
        status_list = list(statuses)
        placeholders = ",".join(["?"] * len(status_list))
        query += f" WHERE status IN ({placeholders})"
        params.extend(status_list)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    with _conn() as conn:
        rows = conn.execute(query, params).fetchall()

    return [
        {
            "id": row[0],
            "type": row[1],
            "status": row[2],
            "stage": row[3],
            "progress": row[4],
            "error_message": row[5],
            "created_at": row[6],
            "updated_at": row[7],
            "duration_ms": row[8],
        }
        for row in rows
    ]


def list_active_jobs(limit: int = 20) -> List[Dict[str, Any]]:
    """Return jobs that are currently running, queued, or recently failed."""

    return list_jobs(limit=limit, statuses=["queued", "running", "failed"])


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
        # Validate status transitions if status is present
        if any(s.startswith("status=") for s in sets):
            cur = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
            if cur:
                current = cur[0]
                new_status = None
                for idx, s in enumerate(sets):
                    if s.startswith("status="):
                        new_status = params[idx]
                        break
                if new_status is not None and new_status != current:
                    allowed = {
                        "queued": {"running", "failed", "complete"},
                        "running": {"complete", "failed"},
                        "complete": set(),
                        "failed": set(),
                    }
                    if new_status not in allowed.get(current, set()):
                        raise ValueError(f"Illegal job status transition {current} -> {new_status}")

        conn.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id=?", (*params, job_id))


def set_status(job_id: str, status: str) -> None:
    """Update the job ``status`` field."""

    _update(job_id, status=status)


def set_progress(job_id: str, progress: Optional[int]) -> None:
    """Update ``progress`` while clamping it between 0 and 100."""

    if progress is None:
        _update(job_id, progress=None)
        return
    _update(job_id, progress=max(0, min(100, int(progress))))


def update_job_status(
    job_id: str,
    *,
    stage: Any = UNSET,
    progress: Any = UNSET,
    error_message: Any = UNSET,
    status: Any = UNSET,
    duration_ms: Any = UNSET,
) -> None:
    """Update job metadata in one call while touching ``updated_at``."""

    updates: Dict[str, Any] = {}
    if stage is not UNSET:
        updates["stage"] = stage
    if progress is not UNSET:
        if progress is None:
            updates["progress"] = None
        else:
            updates["progress"] = max(0, min(100, int(progress)))
    if error_message is not UNSET:
        updates["error_message"] = error_message
    if status is not UNSET:
        updates["status"] = status
    if duration_ms is not UNSET:
        updates["duration_ms"] = duration_ms
    if updates:
        _update(job_id, **updates)


def append_log(job_id: str, line: str) -> None:
    """Append a line to the job log with simple truncation."""

    with _conn() as conn:
        row = conn.execute("SELECT logs FROM jobs WHERE id=?", (job_id,)).fetchone()
        previous = row[0] or ""
        new_logs = (previous + ("\n" if previous else "") + line)[:20000]
        conn.execute(
            "UPDATE jobs SET logs=?, updated_at=? WHERE id=?", (new_logs, now(), job_id)
        )


def set_result(
    job_id: str, result: Dict[str, Any], *, duration_ms: Optional[int] = None
) -> None:
    """Persist a successful result payload."""

    update_kwargs: Dict[str, Any] = {
        "result": result,
        "status": "complete",
        "stage": "complete",
        "progress": 100,
        "error_message": None,
    }
    if duration_ms is not None:
        update_kwargs["duration_ms"] = duration_ms
    _update(job_id, **update_kwargs)


def set_error(
    job_id: str,
    error: str,
    *,
    progress: Optional[int] = None,
    duration_ms: Optional[int] = None,
) -> None:
    """Record an error state for the job."""

    # Attach a unified error envelope into the result field as well, so
    # API consumers see the same shape they get from exception handlers.
    try:
        from app.web.errors import error_envelope  # local import to avoid cycles
        unified_error = error_envelope("job_failed", str(error), details=None)
    except Exception:  # pragma: no cover - defensive fallback
        unified_error = {"error": {"code": "job_failed", "message": str(error), "details": None}}

    update_kwargs: Dict[str, Any] = {
        "error_message": error,
        "status": "failed",
        "stage": "failed",
        "progress": progress,
        "result": unified_error,
    }
    if duration_ms is not None:
        update_kwargs["duration_ms"] = duration_ms
    _update(job_id, **update_kwargs)


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
                    # Transition queued -> running using validation
                    update_job_status(job_id, status="running", stage="running", progress=0)

                payload = json.loads(payload_json)
                handler = self.handlers.get(job_type)
                if not handler:
                    set_error(job_id, f"No handler for job type '{job_type}'")
                    continue

                append_log(job_id, f"Starting job {job_id} ({job_type})")
                started = time.time()
                try:
                    handler(job_id, payload)
                    duration_ms = int((time.time() - started) * 1000)
                    update_job_status(job_id, duration_ms=duration_ms)
                except Exception as exc:  # pragma: no cover - defensive logging
                    append_log(job_id, traceback.format_exc())
                    duration_ms = int((time.time() - started) * 1000)
                    set_error(
                        job_id,
                        f"{type(exc).__name__}: {exc}",
                        progress=None,
                        duration_ms=duration_ms,
                    )
            except Exception:
                time.sleep(self.poll_interval)

    def stop(self) -> None:
        """Signal the worker loop to exit on the next iteration."""

        self.running = False
