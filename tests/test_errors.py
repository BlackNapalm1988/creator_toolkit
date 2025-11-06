from typing import Dict

from modules import auth as auth_module
from modules import users as users_module


def _auth_headers(user: Dict[str, object]) -> Dict[str, str]:
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def _create_user(email: str = "err@example.com") -> Dict[str, object]:
    user_id = users_module.create_user(
        email=email,
        full_name="Err User",
        password_hash=auth_module.hash_password("pw"),
        is_verified=True,
        role="owner",
    )
    return {"id": user_id, "email": email}


def test_unified_http_exception_handlers(client):
    # 400 via /projects POST
    resp_400 = client.post("/projects", json={})
    assert resp_400.status_code == 400
    body_400 = resp_400.json()
    assert body_400["error"]["code"] == "bad_request"
    assert body_400["error"]["message"] == "id required"

    # 404 via /projects/{pid}
    resp_404 = client.get("/projects/does-not-exist")
    assert resp_404.status_code == 404
    body_404 = resp_404.json()
    assert body_404["error"]["code"] == "not_found"


def test_unified_validation_error_handler(client):
    # Missing required fields -> 422
    resp = client.post("/auth/register", json={"email": "bad"})
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"] == "Validation failed"
    assert isinstance(body["error"].get("details"), list)


def test_unified_internal_error_handler(client, monkeypatch):
    # Force YouTube OAuth to be missing -> raises HTTPException 500
    for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"):
        monkeypatch.delenv(key, raising=False)
    user = _create_user("internal@example.com")
    resp = client.get("/youtube/auth/url", headers=_auth_headers(user))
    assert resp.status_code == 500
    body = resp.json()
    assert body["error"]["code"] == "internal_error"
    assert body["error"]["message"] == "YouTube OAuth not configured"
