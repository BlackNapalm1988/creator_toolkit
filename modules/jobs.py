import os, sqlite3, json, time, threading, uuid, traceback
from typing import Optional, Dict, Any, List, Callable

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jobs.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
_lock = threading.Lock()

def _conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_jobs_db():
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS jobs (
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
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")

def now() -> int:
    return int(time.time())

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

def enqueue(job_type: str, payload: Dict[str, Any]) -> str:
    jid = new_id(job_type)
    with _conn() as c:
        c.execute("""INSERT INTO jobs (id,type,payload,status,progress,result,error,logs,created_at,updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?)""",
                  (jid, job_type, json.dumps(payload), "queued", 0, None, None, "", now(), now()))
    return jid

def get_job(jid: str) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute("SELECT id,type,payload,status,progress,result,error,logs,created_at,updated_at FROM jobs WHERE id=?", (jid,)).fetchone()
        if not row: return None
        return {
            "id": row[0], "type": row[1],
            "payload": json.loads(row[2]), "status": row[3],
            "progress": row[4], "result": json.loads(row[5]) if row[5] else None,
            "error": row[6], "logs": row[7], "created_at": row[8], "updated_at": row[9]
        }

def list_jobs(limit: int = 50) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT id,type,status,progress,created_at,updated_at FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [{"id":r[0],"type":r[1],"status":r[2],"progress":r[3],"created_at":r[4],"updated_at":r[5]} for r in rows]

def _update(jid: str, **kwargs):
    sets, params = [], []
    for k,v in kwargs.items():
        if k in ("payload","result") and v is not None:
            import json as _json
            v = _json.dumps(v)
        sets.append(f"{k}=?"); params.append(v)
    sets.append("updated_at=?"); params.append(now())
    with _conn() as c:
        c.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id=?", (*params, jid))

def set_status(jid: str, status: str):
    _update(jid, status=status)

def set_progress(jid: str, progress: int):
    _update(jid, progress=max(0, min(100, int(progress))))

def append_log(jid: str, line: str):
    with _conn() as c:
        row = c.execute("SELECT logs FROM jobs WHERE id=?", (jid,)).fetchone()
        prev = row[0] or ""
        new_logs = (prev + ("\n" if prev else "") + line)[:20000]
        c.execute("UPDATE jobs SET logs=?, updated_at=? WHERE id=?", (new_logs, now(), jid))

def set_result(jid: str, result: Dict[str, Any]):
    _update(jid, result=result, status="done", progress=100)

def set_error(jid: str, err: str):
    _update(jid, error=err, status="error", progress=100)

class QueueWorker(threading.Thread):
    def __init__(self, handlers: Dict[str, Callable[[str, Dict[str, Any]], None]], poll_interval: float = 0.8):
        super().__init__(daemon=True)
        self.handlers = handlers
        self.poll_interval = poll_interval
        self.running = True

    def run(self):
        while self.running:
            try:
                with _conn() as c:
                    row = c.execute("SELECT id,type,payload FROM jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1").fetchone()
                    if not row:
                        time.sleep(self.poll_interval); continue
                    jid, jtype, payload_json = row
                    c.execute("UPDATE jobs SET status='running', updated_at=? WHERE id=?", (now(), jid))

                import json as _json
                payload = _json.loads(payload_json)
                handler = self.handlers.get(jtype)
                if not handler:
                    set_error(jid, f"No handler for job type '{jtype}'")
                    continue
                append_log(jid, f"Starting job {jid} ({jtype})")
                try:
                    handler(jid, payload)
                except Exception as e:
                    tb = traceback.format_exc()
                    append_log(jid, tb)
                    set_error(jid, f"{type(e).__name__}: {e}")
            except Exception:
                time.sleep(self.poll_interval)

    def stop(self):
        self.running = False
