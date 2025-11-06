from pathlib import Path
from typing import Dict

import main
from modules import auth as auth_module
from modules import users as users_module


def _create_user(
    email: str,
    *,
    role: str = "owner",
    is_verified: bool = True,
    password: str = "example-password",
) -> Dict[str, object]:
    user_id = users_module.create_user(
        email=email,
        full_name="YouTube Tester",
        password_hash=auth_module.hash_password(password),
        is_verified=is_verified,
        role=role,
    )
    return {"id": user_id, "email": email, "password": password}


def _auth_headers(user: Dict[str, object]) -> Dict[str, str]:
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def test_youtube_upload_json_success(client, tmp_path, monkeypatch):
    user = _create_user("yt-owner@example.com")

    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"fake video bytes")

    expected_payload = {
        "video_id": "abc123",
        "youtube_response": {"id": "abc123"},
        "requested_visibility": "public",
        "scheduled_publish_at": "2025-10-27T20:00:00Z",
    }

    def fake_upload_from_disk(
        *,
        user_id,
        file_path,
        title,
        description,
        tags,
        privacy_status,
        publish_at,
    ):
        assert user_id == user["id"]
        assert Path(file_path) == video_path
        assert title == "Demo Title"
        assert description == "Description"
        assert tags == ["tag1", "tag2"]
        assert privacy_status == "public"
        assert publish_at == "2025-10-27T20:00:00Z"
        return expected_payload

    monkeypatch.setattr(main, "_youtube_upload_from_disk", fake_upload_from_disk)

    payload = {
        "video_path": str(video_path),
        "title": "Demo Title",
        "description": "Description",
        "tags": ["tag1", "tag2"],
        "privacy_status": "public",
        "publish_at": "2025-10-27T20:00:00Z",
    }

    response = client.post(
        "/youtube/upload",
        headers=_auth_headers(user),
        json=payload,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["video_id"] == expected_payload["video_id"]
    assert body["requested_visibility"] == expected_payload["requested_visibility"]
    assert body["scheduled_publish_at"] == expected_payload["scheduled_publish_at"]
    assert body["youtube_response"] == expected_payload["youtube_response"]


def test_youtube_upload_json_missing_fields(client):
    user = _create_user("yt-missing@example.com")

    response = client.post(
        "/youtube/upload",
        headers=_auth_headers(user),
        json={},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "bad_request"
    assert body["error"]["message"] == "video_path and title are required"


def test_youtube_upload_json_missing_file(client):
    user = _create_user("yt-missing-file@example.com")

    payload = {
        "video_path": "static/uploads/does-not-exist.mp4",
        "title": "Missing",
    }

    response = client.post(
        "/youtube/upload",
        headers=_auth_headers(user),
        json=payload,
    )

    assert response.status_code == 404
    err = response.json()["error"]
    assert err["code"] == "not_found"
    assert "File not found" in err["message"]


def test_youtube_upload_json_leading_slash_path(client, tmp_path, monkeypatch):
    user = _create_user("yt-leading@example.com")

    relative_path = Path("static/uploads/leading.mp4")
    project_root = tmp_path / "project-root"
    project_root.mkdir(parents=True, exist_ok=True)
    actual_file = project_root / relative_path
    actual_file.parent.mkdir(parents=True, exist_ok=True)
    actual_file.write_bytes(b"fake video bytes")

    def fake_project_path(*parts):
        return project_root.joinpath(*parts)

    monkeypatch.setattr(main, "project_path", fake_project_path)

    expected_payload = {
        "video_id": "xyz789",
        "youtube_response": {"id": "xyz789"},
        "requested_visibility": "unlisted",
        "scheduled_publish_at": None,
    }

    def fake_upload_from_disk(
        *,
        user_id,
        file_path,
        title,
        description,
        tags,
        privacy_status,
        publish_at,
    ):
        assert user_id == user["id"]
        assert Path(file_path) == actual_file
        assert title == "Leading"
        assert description == ""
        assert tags == []
        assert privacy_status == "unlisted"
        assert publish_at is None
        return expected_payload

    monkeypatch.setattr(main, "_youtube_upload_from_disk", fake_upload_from_disk)

    payload = {
        "video_path": f"/{relative_path.as_posix()}",
        "title": "Leading",
    }

    response = client.post(
        "/youtube/upload",
        headers=_auth_headers(user),
        json=payload,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["video_id"] == expected_payload["video_id"]
