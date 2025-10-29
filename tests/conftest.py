import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure consistent JWT secret for tests before importing the application.
os.environ.setdefault("JWT_SECRET", "test-secret")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main  # noqa: E402  pylint: disable=wrong-import-position
from modules import jobs as jobs_module
from modules import users as users_module


@pytest.fixture(autouse=True)
def isolate_databases(tmp_path, monkeypatch):
    """Use temporary SQLite databases for auth and jobs during each test."""

    auth_db = tmp_path / "auth.db"
    jobs_db = tmp_path / "jobs.db"
    auth_db.parent.mkdir(parents=True, exist_ok=True)
    jobs_db.parent.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(users_module, "DB_PATH", str(auth_db))
    monkeypatch.setattr(jobs_module, "DB_PATH", str(jobs_db))

    users_module.init_db()
    jobs_module.init_jobs_db()
    main.bootstrap_default_admin()
    yield


@pytest.fixture
def client():
    """Return a TestClient bound to the FastAPI app."""

    return TestClient(main.app)
