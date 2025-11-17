import pytest
from pydantic import ValidationError

import main
from app.models.admin_users import (
    AdminPasswordChangeReq,
    AdminUserCreateReq,
    AdminUserUpdateReq,
)
from modules import auth as auth_module
from modules import users as users_module


def _admin_headers():
    admin = users_module.get_user_by_email(main.DEFAULT_ADMIN_EMAIL)
    token = auth_module.create_access_token(admin["id"], admin["email"])
    return admin, {"Authorization": f"Bearer {token}"}


def _make_user(email: str, role: str = "viewer", password: str = "Password!1") -> dict:
    user_id = users_module.create_user(
        email=email,
        full_name="Managed User",
        password_hash=auth_module.hash_password(password),
        is_verified=True,
        role=role,
        workspace="Default",
    )
    return {"id": user_id, "email": email, "password": password}


def _headers_for(user: dict) -> dict:
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def test_admin_users_list_enforced(client):
    _, admin_headers = _admin_headers()
    resp = client.get("/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    payload = resp.json()
    assert "users" in payload and "roles" in payload
    viewer = _make_user("viewer-list@example.com", role="viewer")
    resp_forbidden = client.get("/admin/users", headers=_headers_for(viewer))
    assert resp_forbidden.status_code == 403


def test_admin_create_user_manual_password(client):
    _, admin_headers = _admin_headers()
    payload = {
        "full_name": "Example Admin",
        "email": "new-admin@example.com",
        "role": "owner",
        "workspace": "Default",
        "password": "ManualPass123!",
        "generate_password": False,
    }
    resp = client.post("/admin/users", headers=admin_headers, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == payload["email"]
    assert data["generated_password"] is None
    created = users_module.get_user_by_email(payload["email"])
    assert created is not None
    assert auth_module.verify_password(payload["password"], created["password_hash"])


def test_admin_create_user_generated_password(client):
    _, admin_headers = _admin_headers()
    resp = client.post(
        "/admin/users",
        headers=admin_headers,
        json={
            "full_name": "Generated User",
            "email": "generated@example.com",
            "role": "viewer",
            "workspace": "Default",
            "generate_password": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["generated_password"], str)
    assert len(data["generated_password"]) >= 8
    created = users_module.get_user_by_email("generated@example.com")
    assert created is not None
    assert created["is_active"] is True


def test_admin_update_and_activation_flow(client):
    _, admin_headers = _admin_headers()
    user = _make_user("toggle@example.com", role="viewer")
    resp = client.put(
        f"/admin/users/{user['id']}",
        headers=admin_headers,
        json={
            "full_name": "Updated Name",
            "email": "updated@example.com",
            "role": "editor",
            "workspace": "Default",
            "is_active": False,
        },
    )
    assert resp.status_code == 200
    refreshed = users_module.get_user_by_id(user["id"])
    assert refreshed["email"] == "updated@example.com"
    assert refreshed["role"] == "editor"
    assert refreshed["is_active"] is False


def test_admin_password_change_updates_hash_and_login(client):
    _, admin_headers = _admin_headers()
    user = _make_user("changepass@example.com", password="initialPass123!")
    resp = client.post(
        f"/admin/users/{user['id']}/password",
        headers=admin_headers,
        json={"password": "NewPass456!", "confirm_password": "NewPass456!"},
    )
    assert resp.status_code == 200
    login = client.post(
        "/auth/login", json={"email": user["email"], "password": "NewPass456!"}
    )
    assert login.status_code == 200


def test_deactivate_blocks_login_until_reenabled(client):
    _, admin_headers = _admin_headers()
    user = _make_user("inactive@example.com", password="ValidPass123!")
    # Deactivate
    client.put(
        f"/admin/users/{user['id']}",
        headers=admin_headers,
        json={"is_active": False},
    )
    denied = client.post(
        "/auth/login", json={"email": user["email"], "password": "ValidPass123!"}
    )
    assert denied.status_code == 403
    # Reactivate
    client.put(
        f"/admin/users/{user['id']}",
        headers=admin_headers,
        json={"is_active": True},
    )
    allowed = client.post(
        "/auth/login", json={"email": user["email"], "password": "ValidPass123!"}
    )
    assert allowed.status_code == 200
    record = users_module.get_user_by_email(user["email"])
    assert record["last_login_at"] is not None


def test_non_admin_cannot_change_other_users(client):
    viewer = _make_user("viewer-mutate@example.com", role="viewer")
    target = _make_user("target@example.com")
    resp = client.put(
        f"/admin/users/{target['id']}",
        headers=_headers_for(viewer),
        json={"full_name": "Nope"},
    )
    assert resp.status_code == 403


def test_inactive_user_cannot_access_api(client):
    user = _make_user("token-block@example.com", role="owner")
    headers = _headers_for(user)
    first = client.get("/dashboard/data", headers=headers)
    assert first.status_code == 200
    _, admin_headers = _admin_headers()
    client.put(
        f"/admin/users/{user['id']}",
        headers=admin_headers,
        json={"is_active": False},
    )
    blocked = client.get("/dashboard/data", headers=headers)
    assert blocked.status_code == 403


def test_admin_user_create_model_allows_test_domain():
    req = AdminUserCreateReq(full_name="Tester", email="user@local.test", role="viewer")
    assert req.email == "user@local.test"


def test_admin_user_create_model_rejects_empty_fields():
    with pytest.raises(ValidationError):
        AdminUserCreateReq(full_name=" ", email="person@example.com", role="viewer")
    with pytest.raises(ValidationError):
        AdminUserCreateReq(full_name="Name", email=" ", role="viewer")


def test_admin_user_update_model_validations():
    with pytest.raises(ValidationError):
        AdminUserUpdateReq(full_name=" ")
    req = AdminUserUpdateReq(email=None)
    assert req.email is None


def test_admin_password_change_model_validation():
    with pytest.raises(ValidationError):
        AdminPasswordChangeReq(password="short", confirm_password="short")
    with pytest.raises(ValidationError):
        AdminPasswordChangeReq(password="ValidPass12", confirm_password="Mismatch")
