from typing import Dict

import main  # noqa: E402  pylint: disable=wrong-import-position
from modules import auth as auth_module
from modules import users as users_module


def _auth_headers(user: Dict[str, object]) -> Dict[str, str]:
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_read_branding(client):
    admin = users_module.get_user_by_email(main.DEFAULT_ADMIN_EMAIL)
    response = client.get("/admin/system/branding", headers=_auth_headers(admin))
    assert response.status_code == 200
    payload = response.json()
    assert payload == {"badge_text": "CT"}


def test_admin_can_update_branding(client):
    admin = users_module.get_user_by_email(main.DEFAULT_ADMIN_EMAIL)

    update_response = client.post(
        "/admin/system/branding",
        json={"badge_text": "AI"},
        headers=_auth_headers(admin),
    )
    assert update_response.status_code == 200
    update_payload = update_response.json()
    assert update_payload["branding"]["badge_text"] == "AI"

    follow_up = client.get("/admin/system/branding", headers=_auth_headers(admin))
    assert follow_up.status_code == 200
    assert follow_up.json() == {"badge_text": "AI"}

    reset_response = client.post(
        "/admin/system/branding",
        json={"badge_text": "  "},
        headers=_auth_headers(admin),
    )
    assert reset_response.status_code == 200
    assert reset_response.json()["branding"]["badge_text"] == "CT"


def test_non_admin_cannot_update_branding(client):
    user_id = users_module.create_user(
        email="viewer-brand@example.com",
        full_name="Viewer",
        password_hash=auth_module.hash_password("password"),
        is_verified=True,
        role="viewer",
    )
    viewer = {"id": user_id, "email": "viewer-brand@example.com"}

    response = client.post(
        "/admin/system/branding",
        json={"badge_text": "ZZ"},
        headers=_auth_headers(viewer),
    )
    assert response.status_code == 403
