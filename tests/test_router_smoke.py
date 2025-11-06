from fastapi.testclient import TestClient

import main


def test_imagine_models_requires_auth():
    client = TestClient(main.app)
    resp = client.get("/imagine/models")
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"


def test_elevenlabs_voices_requires_auth():
    client = TestClient(main.app)
    resp = client.get("/elevenlabs/voices")
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"


def test_jobs_requires_auth_or_role():
    client = TestClient(main.app)
    resp = client.get("/jobs")
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"
