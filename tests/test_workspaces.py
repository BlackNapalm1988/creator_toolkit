import os
from pathlib import Path
import uuid


def test_list_workspaces_includes_default(client):

    r = client.get("/api/workspaces")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "Default" in data["items"]


def test_create_workspace_success_and_conflict(client):

    name = f"ws_{uuid.uuid4().hex[:8]}"
    # Create
    r = client.post("/api/workspaces", json={"name": name})
    assert r.status_code == 201
    assert Path("workspaces").joinpath(name).exists()

    # Duplicate
    r2 = client.post("/api/workspaces", json={"name": name})
    assert r2.status_code == 409


def test_create_workspace_then_list(client):
    # Create multiple and verify listing includes them and Default
    client.post("/api/workspaces", json={"name": "A1"})
    client.post("/api/workspaces", json={"name": "B2"})
    r = client.get("/api/workspaces")
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert "Default" in items
    assert "A1" in items and "B2" in items
