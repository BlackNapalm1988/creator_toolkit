import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

WORKSPACES_ROOT = Path("workspaces")
DEFAULT_NAME = "Default"

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class WorkspaceIn(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name required")
        if not re.fullmatch(r"[A-Za-z0-9_\-\s]+", v):
            raise ValueError("Use letters, numbers, dash, underscore, or space")
        if v.lower() == "con":
            raise ValueError("Invalid reserved name")
        return v


@router.get("")
def list_workspaces():
    WORKSPACES_ROOT.mkdir(parents=True, exist_ok=True)
    items = [DEFAULT_NAME]
    for p in sorted(WORKSPACES_ROOT.iterdir()):
        if p.is_dir() and p.name != DEFAULT_NAME:
            items.append(p.name)
    (WORKSPACES_ROOT / DEFAULT_NAME).mkdir(exist_ok=True)
    return {"items": items}


@router.post("", status_code=201)
def create_workspace(ws: WorkspaceIn):
    WORKSPACES_ROOT.mkdir(parents=True, exist_ok=True)
    target = WORKSPACES_ROOT / ws.name
    if target.exists():
        raise HTTPException(status_code=409, detail="Workspace already exists")
    try:
        target.mkdir()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "name": ws.name}
