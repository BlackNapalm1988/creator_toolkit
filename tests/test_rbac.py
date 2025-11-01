from typing import Dict

import pytest

import main
from modules import auth as auth_module
from modules import users as users_module


def _create_user(
    email: str,
    *,
    role: str,
    is_verified: bool = True,
    must_change_password: bool = False,
    password: str = "example-password",
) -> Dict[str, object]:
    """Provision a user with the desired role for RBAC tests."""

    user_id = users_module.create_user(
        email=email,
        full_name="RBAC User",
        password_hash=auth_module.hash_password(password),
        is_verified=is_verified,
        role=role,
        must_change_password=must_change_password,
    )
    return {"id": user_id, "email": email, "password": password}


def _auth_headers(user: Dict[str, object]) -> Dict[str, str]:
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def test_default_admin_bootstrap_present():
    """The first-run bootstrap should create an admin user."""

    admin = users_module.get_user_by_email(main.DEFAULT_ADMIN_EMAIL)
    assert admin is not None
    assert admin["role"] == "admin"
    assert admin["must_change_password"] is True


def test_test_users_bootstrapped():
    """All predefined test users should exist with verified status and password."""

    for role, email in main.TEST_USER_ACCOUNTS.items():
        user = users_module.get_user_by_email(email)
        assert user is not None, f"Missing test user for role {role}"
        assert user["role"] == role
        assert user["is_verified"] is True
        assert user["must_change_password"] is False
        assert auth_module.verify_password(
            main.TEST_USER_PASSWORD, user["password_hash"]
        )


def test_admin_only_smtp_endpoints(client):
    admin = users_module.get_user_by_email(main.DEFAULT_ADMIN_EMAIL)
    response = client.get("/admin/system/smtp", headers=_auth_headers(admin))
    assert response.status_code == 200
    data = response.json()
    assert {"host", "port", "use_tls", "username", "from_address"}.issubset(data.keys())

    viewer = _create_user("viewer@example.com", role="viewer")
    viewer_resp = client.get("/admin/system/smtp", headers=_auth_headers(viewer))
    assert viewer_resp.status_code == 403


@pytest.mark.parametrize(
    "role, expected_status",
    [
        ("owner", 400),  # Allowed but missing refresh token triggers a 400 error
        ("viewer", 403),
    ],
)
def test_publish_permissions_enforced(client, role, expected_status):
    user = _create_user(f"{role}@example.com", role=role)
    files = {"video_file": ("demo.mp4", b"fake", "video/mp4")}
    data = {
        "title": "Example",
        "description": "",
        "tags": "",
        "privacy_status": "unlisted",
        "publish_at": "",
    }
    response = client.post(
        "/youtube/upload",
        headers=_auth_headers(user),
        files=files,
        data=data,
    )
    assert response.status_code == expected_status


def test_editor_can_enqueue_qa_batch(client):
    editor = _create_user("editor@example.com", role="editor")
    payload = {"paths": ["a.mp4"], "palette": [], "thresholds": {"loop": 0.9}}
    response = client.post(
        "/qa/batch_async", json=payload, headers=_auth_headers(editor)
    )
    assert response.status_code == 200
    body = response.json()
    assert "job_id" in body


def test_viewer_can_access_dashboard(client):
    viewer = _create_user("viewer2@example.com", role="viewer")
    response = client.get("/dashboard/data", headers=_auth_headers(viewer))
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == "viewer"


def test_password_rotation_cleared_after_update(client):
    user = _create_user(
        "rotation@example.com",
        role="owner",
        must_change_password=True,
        password="old-password",
    )
    payload = {"current_password": "old-password", "new_password": "new-password"}
    response = client.post(
        "/profile/password", json=payload, headers=_auth_headers(user)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["must_change_password"] is False
    refreshed = users_module.get_user_by_id(user["id"])
    assert refreshed["must_change_password"] is False
