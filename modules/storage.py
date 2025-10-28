"""Thread-safe JSON persistence helpers for projects and presets."""

from __future__ import annotations

import json
import os
import threading
from typing import Any, Dict, List, Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "projects.json")
_LOCK = threading.Lock()

DEFAULT_DB = {"projects": [], "presets": []}


def _load() -> Dict[str, Any]:
    """Load the JSON store, creating it with defaults if it doesn't exist."""

    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DB_PATH):
        with open(DB_PATH, "w", encoding="utf-8") as fh:
            json.dump(DEFAULT_DB, fh, indent=2)
        return DEFAULT_DB.copy()
    with open(DB_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _save(db: Dict[str, Any]) -> None:
    """Persist the provided database dictionary to disk."""

    with open(DB_PATH, "w", encoding="utf-8") as fh:
        json.dump(db, fh, indent=2)


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
