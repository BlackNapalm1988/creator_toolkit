import pytest

from modules import auth as auth_module
from modules import job_handlers
from modules import jobs as jobs_module
from modules import users as users_module


def _create_user(email: str, role: str) -> dict:
    user_id = users_module.create_user(
        email=email,
        full_name="Job User",
        password_hash=auth_module.hash_password("example-password"),
        is_verified=True,
        role=role,
    )
    return {"id": user_id, "email": email, "role": role}


def _auth_headers(user: dict) -> dict:
    token = auth_module.create_access_token(user["id"], user["email"])
    return {"Authorization": f"Bearer {token}"}


def test_job_handle_qa_batch_sets_complete(tmp_path):
    job_id = jobs_module.enqueue("qa_batch", {"paths": []})
    clip_path = tmp_path / "clip.mp4"
    clip_path.write_bytes(b"fake-data")

    payload = {"paths": [str(clip_path)]}
    job_handlers.job_handle_qa_batch(job_id, payload)

    job = jobs_module.get_job(job_id)
    assert job is not None
    assert job["status"] == "complete"
    assert job["stage"] == "complete"
    assert job["progress"] == 100
    assert job["error_message"] is None
    assert job["updated_at"] >= job["created_at"]


def test_job_handle_package_failure_records_error(monkeypatch):
    job_id = jobs_module.enqueue(
        "package",
        {"loop_video_path": "loop.mp4", "audio_path": "audio.mp3"},
    )

    monkeypatch.setattr(job_handlers, "probe_audio_duration", lambda path: -1)

    job_handlers.job_handle_package(job_id, {"loop_video_path": "loop.mp4", "audio_path": "audio.mp3"})

    job = jobs_module.get_job(job_id)
    assert job is not None
    assert job["status"] == "failed"
    assert job["stage"] == "failed"
    assert job["error_message"] == "Invalid audio asset"
    assert job["progress"] is None


def test_jobs_list_and_detail_require_roles(client):
    job_id = jobs_module.enqueue("qa_batch", {"sample": 1})
    jobs_module.update_job_status(job_id, stage="qa", status="running", progress=45)

    for role in ("admin", "owner", "editor"):
        user = _create_user(f"{role}@example.com", role)
        resp = client.get("/jobs", headers=_auth_headers(user))
        assert resp.status_code == 200
        payload = resp.json()
        assert "jobs" in payload
        assert any(job["id"] == job_id for job in payload["jobs"])

        detail = client.get(f"/jobs/{job_id}", headers=_auth_headers(user))
        assert detail.status_code == 200
        detail_payload = detail.json()
        assert detail_payload["id"] == job_id
        assert detail_payload["status"] == "running"
        assert detail_payload["stage"] in {"qa", "running"}
        assert "updated_at" in detail_payload
        assert "created_at" in detail_payload
        assert "duration_ms" in detail_payload

    viewer = _create_user("viewer-jobs@example.com", "viewer")
    list_resp = client.get("/jobs", headers=_auth_headers(viewer))
    assert list_resp.status_code == 403
    detail_resp = client.get(f"/jobs/{job_id}", headers=_auth_headers(viewer))
    assert detail_resp.status_code == 403
