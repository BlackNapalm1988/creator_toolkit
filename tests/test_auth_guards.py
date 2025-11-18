from modules import auth as auth_module
from modules import users as users_module


def _create_user(email: str, *, is_active: bool) -> dict:
    password = "example-password"
    user_id = users_module.create_user(
        email=email,
        full_name="Auth Guard User",
        password_hash=auth_module.hash_password(password),
        is_verified=True,
        role="owner",
        is_active=is_active,
    )
    return {"id": user_id, "email": email, "password": password}


def test_inactive_user_cannot_login(client):
    user = _create_user("inactive@example.com", is_active=False)

    resp = client.post(
        "/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert resp.status_code == 403
    data = resp.json()
    assert data["error"]["code"] == "forbidden"
    assert data["error"]["message"] == "Inactive user"


def test_inactive_user_cannot_access_protected_route(client):
    user = _create_user("inactive2@example.com", is_active=False)
    token = auth_module.create_access_token(user["id"], user["email"])

    resp = client.get("/dashboard/data", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    body = resp.json()
    assert body["error"]["code"] == "forbidden"
    assert body["error"]["message"] == "Inactive user"


def test_active_user_can_access_protected_route(client):
    user = _create_user("active@example.com", is_active=True)
    token = auth_module.create_access_token(user["id"], user["email"])

    resp = client.get("/dashboard/data", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["id"] == user["id"]
    assert "providers" in body
