import os, json, threading
from typing import Dict, Any, List, Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH  = os.path.join(DATA_DIR, "projects.json")
_lock    = threading.Lock()

DEFAULT_DB = {"projects": [], "presets": []}

def _load() -> Dict[str, Any]:
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DB_PATH):
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_DB, f, indent=2)
        return DEFAULT_DB.copy()
    with open(DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def _save(db: Dict[str, Any]):
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)

def list_projects() -> List[Dict[str, Any]]:
    with _lock:
        return _load().get("projects", [])

def get_project(pid: str) -> Optional[Dict[str, Any]]:
    with _lock:
        db = _load()
        return next((p for p in db.get("projects", []) if p.get("id") == pid), None)

def upsert_project(p: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        db = _load()
        projects = db.setdefault("projects", [])
        for i, existing in enumerate(projects):
            if existing.get("id") == p.get("id"):
                projects[i] = p
                _save(db)
                return p
        projects.append(p)
        _save(db)
        return p

def delete_project(pid: str) -> bool:
    with _lock:
        db = _load()
        orig = len(db.get("projects", []))
        db["projects"] = [p for p in db.get("projects", []) if p.get("id") != pid]
        _save(db)
        return len(db["projects"]) < orig

def list_presets() -> List[Dict[str, Any]]:
    with _lock:
        return _load().get("presets", [])

def upsert_preset(pr: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        db = _load()
        presets = db.setdefault("presets", [])
        for i, existing in enumerate(presets):
            if existing.get("id") == pr.get("id"):
                presets[i] = pr
                _save(db)
                return pr
        presets.append(pr)
        _save(db)
        return pr

def delete_preset(pid: str) -> bool:
    with _lock:
        db = _load()
        orig = len(db.get("presets", []))
        db["presets"] = [p for p in db.get("presets", []) if p.get("id") != pid]
        _save(db)
        return len(db["presets"]) < orig
