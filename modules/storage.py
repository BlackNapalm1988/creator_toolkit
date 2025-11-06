"""Thread-safe JSON persistence helpers for projects and presets."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

BASE_DIR = Path(__file__).resolve().parent.parent


PathLike = Union[str, Path]


def project_path(*parts: PathLike) -> Path:
    """Return an absolute path rooted at the project base directory."""

    if not parts:
        return BASE_DIR
    return BASE_DIR.joinpath(*(str(part) for part in parts))


DATA_DIR = project_path("data")
DB_PATH = DATA_DIR / "projects.json"
_LOCK = threading.Lock()

DEFAULT_DB = {"projects": [], "presets": []}


def _ensure_data_dir() -> None:
    """Create the data directory lazily."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load() -> Dict[str, Any]:
    """Load the JSON store, creating it with defaults if it doesn't exist."""

    _ensure_data_dir()
    if not DB_PATH.exists():
        DB_PATH.write_text(json.dumps(DEFAULT_DB, indent=2), encoding="utf-8")
        return DEFAULT_DB.copy()
    return json.loads(DB_PATH.read_text(encoding="utf-8"))


def _save(db: Dict[str, Any]) -> None:
    """Persist the provided database dictionary to disk."""

    _ensure_data_dir()
    DB_PATH.write_text(json.dumps(db, indent=2), encoding="utf-8")


def list_projects() -> List[Dict[str, Any]]:
    """Return all stored projects."""

    with _LOCK:
        return _load().get("projects", [])


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    """Return the project matching ``project_id`` if it exists."""

    with _LOCK:
        db = _load()
        return next((p for p in db.get("projects", []) if p.get("id") == project_id), None)


def upsert_project(project: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update a project record and return the latest value."""

    with _LOCK:
        db = _load()
        projects = db.setdefault("projects", [])
        for index, existing in enumerate(projects):
            if existing.get("id") == project.get("id"):
                projects[index] = project
                _save(db)
                return project
        projects.append(project)
        _save(db)
        return project


def delete_project(project_id: str) -> bool:
    """Delete a project by ID, returning ``True`` if an entry was removed."""

    with _LOCK:
        db = _load()
        original_len = len(db.get("projects", []))
        db["projects"] = [p for p in db.get("projects", []) if p.get("id") != project_id]
        _save(db)
        return len(db["projects"]) < original_len


def list_presets() -> List[Dict[str, Any]]:
    """Return all stored presets."""

    with _LOCK:
        return _load().get("presets", [])


def upsert_preset(preset: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update a preset record."""

    with _LOCK:
        db = _load()
        presets = db.setdefault("presets", [])
        for index, existing in enumerate(presets):
            if existing.get("id") == preset.get("id"):
                presets[index] = preset
                _save(db)
                return preset
        presets.append(preset)
        _save(db)
        return preset


def delete_preset(preset_id: str) -> bool:
    """Delete a preset by ID, returning ``True`` when an entry was removed."""

    with _LOCK:
        db = _load()
        original_len = len(db.get("presets", []))
        db["presets"] = [p for p in db.get("presets", []) if p.get("id") != preset_id]
        _save(db)
        return len(db["presets"]) < original_len
