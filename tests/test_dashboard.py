from datetime import datetime, timezone
from typing import Dict

import main  # noqa: E402  pylint: disable=wrong-import-position
from modules import auth as auth_module
from modules import jobs as jobs_module
from modules import users as users_module


def _issue_token(user_id: int, email: str) -> str:
    """Helper to mint a JWT for the created user."""

    return auth_module.create_access_token(user_id, email)


def _create_sample_user(
    email: str = "test@example.com",
    *,
    is_verified: bool = True,
    role: str = "owner",
    must_change_password: bool = False,
) -> Dict[str, object]:
    """Create a user record and return its details."""

    password_hash = auth_module.hash_password("example-password")
    user_id = users_module.create_user(
        email=email,
        full_name="Test User",
        password_hash=password_hash,
        is_verified=is_verified,
        role=role,
        must_change_password=must_change_password,
    )
    return {"id": user_id, "email": email}


def test_dashboard_shell_routes_expose_active_view(client):
    """Each UI shell route should flag the intended active view."""

    routes = {
        "/dashboard": "dashboard-view",
        "/imagine": "dashboard-view",
        "/create": "create-view",
        "/publish": "publish-view",
        "/system": "system-view",
    }

    for path, expected in routes.items():
        response = client.get(path)
        assert response.status_code == 200
        body = response.text
        assert f'data-active-view="{expected}"' in body


def test_dashboard_data_authenticated_success(client):
    """Authenticated requests should receive the aggregated dashboard payload."""

    user_info = _create_sample_user()
    users_module.upsert_user_key(user_info["id"], "openai", "cipher-openai")

    job_id = jobs_module.enqueue("qa_batch", {"sample": "payload"})
    jobs_module.update_job_status(job_id, stage="qa", status="running", progress=65)

    token = _issue_token(user_info["id"], user_info["email"])
    response = client.get(
        "/dashboard/data", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200

    payload = response.json()
    assert set(payload.keys()) == {
        "user",
        "providers",
        "recent_jobs",
        "recent_assets",
        "active_jobs",
    }

    assert payload["user"]["id"] == user_info["id"]
    assert payload["user"]["display_name"] == "Test User"
    assert payload["user"]["role"] == "owner"
    assert payload["user"]["must_change_password"] is False
    assert payload["providers"] == {
        "openai": "connected",
        "elevenlabs": "missing",
        "youtube": "missing",
    }

    assert payload["recent_assets"] == []

    assert any(job["id"] == job_id for job in payload["recent_jobs"])
    job_entry = next(job for job in payload["recent_jobs"] if job["id"] == job_id)
    assert job_entry["status"] == "running"
    assert job_entry["stage"] in {"qa", "running"}
    assert job_entry["progress"] == 65
    assert "out_path" in job_entry
    assert job_entry["out_path"] is None
    # ``updated_at`` should be an ISO timestamp string when available.
    assert isinstance(job_entry["updated_at"], str)
    # Ensure ISO-8601 structure (YYYY-MM-DDT...).
    current_year = datetime.now(timezone.utc).year
    assert job_entry["updated_at"].startswith(str(current_year))

    active_jobs = payload["active_jobs"]
    assert any(job["id"] == job_id for job in active_jobs)
    active_entry = next(job for job in active_jobs if job["id"] == job_id)
    assert active_entry["status"] == "running"
    assert active_entry["stage"] in {"qa", "running"}
    assert active_entry["error_message"] is None
    assert "out_path" in active_entry


def test_dashboard_data_rejects_unauthenticated(client):
    """Requests without credentials should be rejected like other protected routes."""

    response = client.get("/dashboard/data")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "unauthorized"
    assert payload["error"]["message"] in {"Missing token", "Invalid or expired token"}


def test_user_payload_exposes_expected_fields():
    """The _user_payload helper should surface the intended columns only."""

    user_dict = {
        "id": 42,
        "email": "payload@example.com",
        "full_name": "Payload User",
        "access_group": "Dev",
        "is_verified": 1,
        "password_hash": "secret",
        "role": "admin",
        "must_change_password": True,
        "workspace": "Default",
        "is_active": False,
        "extra_column": "should be ignored",
    }

    result = main._user_payload(user_dict)
    assert result == {
        "id": 42,
        "email": "payload@example.com",
        "full_name": "Payload User",
        "access_group": "Dev",
        "is_verified": True,
        "role": "admin",
        "must_change_password": True,
        "workspace": "Default",
        "is_active": False,
    }
