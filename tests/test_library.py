from pathlib import Path

import main
from modules import auth as auth_module
from modules import users as users_module
from app.services import assets as assets_service


def _auth_headers(user):
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def test_library_listing_returns_user_assets(client, tmp_path, monkeypatch):
    user = {
        "id": users_module.create_user(
            email="lib@example.com",
            full_name="Lib User",
            password_hash=auth_module.hash_password("pass"),
            is_verified=True,
            role="owner",
        ),
        "email": "lib@example.com",
    }

    # Isolate asset index
    assets_path = tmp_path / "assets.json"
    monkeypatch.setattr(assets_service, "ASSETS_PATH", assets_path)

    assets_service.add_asset(
        user_id=user["id"],
        asset_type="video",
        path="/content/uploads/demo.mp4",
        title="Demo Clip",
    )

    resp = client.get("/library", headers=_auth_headers(user))
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["path"].endswith("demo.mp4")
