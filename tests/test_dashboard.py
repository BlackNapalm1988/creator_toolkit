import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import pytest
from fastapi.testclient import TestClient
import jwt as pyjwt

# Ensure the FastAPI app sees a predictable JWT secret during import time.
os.environ.setdefault("JWT_SECRET", "test-secret")

# Add the project root to ``sys.path`` so ``import main`` succeeds when running via pytest.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main  # noqa: E402  pylint: disable=wrong-import-position
from modules import auth as auth_module
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
    yield


@pytest.fixture
def client():
    """Return a TestClient bound to the FastAPI app."""

    return TestClient(main.app)


def _issue_token(user_id: int, email: str) -> str:
    """Helper to mint a JWT for the created user."""

    token = pyjwt.encode({"sub": str(user_id), "email": email}, main.JWT_SECRET, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def _create_sample_user(email: str = "test@example.com", *, is_verified: bool = True) -> Dict[str, object]:
    """Create a user record and return its details."""

    password_hash = auth_module.hash_password("example-password")
    user_id = users_module.create_user(
        email=email,
        full_name="Test User",
        password_hash=password_hash,
        is_verified=is_verified,
        access_group="User",
    )
    return {"id": user_id, "email": email}


def test_dashboard_data_authenticated_success(client):
    """Authenticated requests should receive the aggregated dashboard payload."""

    user_info = _create_sample_user()
    users_module.upsert_user_key(user_info["id"], "openai", "cipher-openai")

    job_id = jobs_module.enqueue("qa_batch", {"sample": "payload"})
    jobs_module.set_progress(job_id, 65)
    jobs_module.set_status(job_id, "running")

    token = _issue_token(user_info["id"], user_info["email"])
    response = client.get("/dashboard/data", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200

    payload = response.json()
    assert set(payload.keys()) == {"user", "providers", "recent_jobs", "recent_assets"}

    assert payload["user"]["id"] == user_info["id"]
    assert payload["user"]["display_name"] == "Test User"
    assert payload["providers"] == {
        "openai": "connected",
        "elevenlabs": "missing",
        "youtube": "missing",
    }

    assert payload["recent_assets"] == []

    assert any(job["id"] == job_id for job in payload["recent_jobs"])
    job_entry = next(job for job in payload["recent_jobs"] if job["id"] == job_id)
    assert job_entry["status"] == "running"
    assert job_entry["progress"] == 65
    # ``updated_at`` should be an ISO timestamp string when available.
    assert isinstance(job_entry["updated_at"], str)
    # Ensure ISO-8601 structure (YYYY-MM-DDT...).
    current_year = datetime.now(timezone.utc).year
    assert job_entry["updated_at"].startswith(str(current_year))


def test_dashboard_data_rejects_unauthenticated(client):
    """Requests without credentials should be rejected like other protected routes."""

    response = client.get("/dashboard/data")
    assert response.status_code == 401
    assert response.json()["detail"] in {"Missing token", "Invalid or expired token"}


def test_user_payload_exposes_expected_fields():
    """The _user_payload helper should surface the intended columns only."""

    user_dict = {
        "id": 42,
        "email": "payload@example.com",
        "full_name": "Payload User",
        "access_group": "Dev",
        "is_verified": 1,
        "password_hash": "secret",
        "extra_column": "should be ignored",
    }

    result = main._user_payload(user_dict)
    assert result == {
        "id": 42,
        "email": "payload@example.com",
        "full_name": "Payload User",
        "access_group": "Dev",
        "is_verified": True,
    }
