"""Lightweight per-user asset index for videos, audio, and masters."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from modules.storage import project_path

ASSETS_PATH = project_path("data", "assets.json")
DEFAULT_DB = {"assets": []}
_LOCK = threading.Lock()


def _ensure_db() -> None:
    ASSETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not ASSETS_PATH.exists():
        ASSETS_PATH.write_text(json.dumps(DEFAULT_DB, indent=2), encoding="utf-8")


def _load() -> Dict[str, Any]:
    _ensure_db()
    return json.loads(ASSETS_PATH.read_text(encoding="utf-8"))


def _save(db: Dict[str, Any]) -> None:
    _ensure_db()
    ASSETS_PATH.write_text(json.dumps(db, indent=2), encoding="utf-8")


def add_asset(
    *,
    user_id: int,
    asset_type: str,
    path: str,
    title: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert a new asset for the given user."""

    asset = {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "type": asset_type,
        "path": path,
        "title": title or "",
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with _LOCK:
        db = _load()
        db.setdefault("assets", []).append(asset)
        _save(db)
    return asset


def list_assets_for_user(
    user_id: int,
    *,
    asset_type: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Return recent assets for a user, optionally filtered by type."""

    with _LOCK:
        db = _load()
        assets = [a for a in db.get("assets", []) if a.get("user_id") == user_id]
        if asset_type:
            assets = [a for a in assets if a.get("type") == asset_type]
        # newest first by created_at
        assets.sort(key=lambda a: a.get("created_at", ""), reverse=True)
        return assets[:limit]


__all__ = ["add_asset", "list_assets_for_user"]
