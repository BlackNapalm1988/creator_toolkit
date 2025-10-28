import os, sqlite3, time
from typing import List, Dict, Any, Optional

CHAT_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chat.db")
os.makedirs(os.path.dirname(CHAT_DB), exist_ok=True)

def _conn():
    return sqlite3.connect(CHAT_DB, check_same_thread=False)

def init_chat_db():
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT,
            model TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)")

def now() -> int:
    return int(time.time())

def create_thread(thread_id: str, user_id: int, model: str, title: str = "New chat") -> str:
    with _conn() as c:
        c.execute("INSERT INTO threads (id,user_id,title,model,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                  (thread_id, user_id, title, model, now(), now()))
    return thread_id

def get_thread(thread_id: str) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute("SELECT id,user_id,title,model,created_at,updated_at FROM threads WHERE id=?", (thread_id,)).fetchone()
        if not row: return None
        return {"id":row[0], "user_id":row[1], "title":row[2], "model":row[3], "created_at":row[4], "updated_at":row[5]}

def list_threads(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT id,title,model,created_at,updated_at FROM threads WHERE user_id=? ORDER BY updated_at DESC LIMIT ?", (user_id, limit)).fetchall()
        return [{"id":r[0], "title":r[1], "model":r[2], "created_at":r[3], "updated_at":r[4]} for r in rows]

def add_message(thread_id: str, role: str, content: str):
    with _conn() as c:
        c.execute("INSERT INTO messages (thread_id,role,content,created_at) VALUES (?,?,?,?)",
                  (thread_id, role, content, now()))
        c.execute("UPDATE threads SET updated_at=? WHERE id=?", (now(), thread_id))

def get_messages(thread_id: str, limit: int = 40) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT role,content,created_at FROM messages WHERE thread_id=? ORDER BY id DESC LIMIT ?", (thread_id, limit)).fetchall()
        rows = list(reversed(rows))
        return [{"role":r[0], "content":r[1], "created_at":r[2]} for r in rows]
