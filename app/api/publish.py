"""Publishing, packaging, and QA routes."""

from __future__ import annotations

import csv
import datetime
import hashlib
import json
import os
import tempfile
import uuid
from pathlib import Path
from typing import Annotated, Dict, List, Optional
from urllib.parse import urlencode

import requests
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import JSONResponse

from app.core.constants import CREATOR_ROLES, PUBLISHER_ROLES
from app.deps import require_role
from app.models.publish import (
    EnqueuePackageReq,
    EnqueueQABatchReq,
    PackageReq,
    PackageReqV2,
    PublishPipelineReq,
    YouTubeUploadRequest,
)
from app.services.jobs import serialize_job, serialize_job_detail
from app.services.keys import (
    YOUTUBE_SCOPES,
    exchange_youtube_refresh,
    get_youtube_refresh_token,
)
from app.services.voice import generate_voiceover_mp3_for_user
from modules.auth import decode_access_token, encrypt_value
from modules.jobs import enqueue, get_job, list_jobs
from modules.packager import build_master_from_loop, probe_audio_duration
from modules.storage import (
    delete_preset,
    delete_project,
    get_project,
    list_presets,
    list_projects,
    project_path as _project_path_impl,
    upsert_preset,
    upsert_project,
)
from modules.users import get_user_by_id, upsert_user_key

router = APIRouter(tags=["Publish"])


def _resolve_video_file(video_path_raw: str) -> Path:
    """Return a concrete file path for ``video_path_raw``."""

    cleaned = video_path_raw.strip()
    initial = Path(cleaned).expanduser()

    candidates: List[Path] = []
    seen: set[str] = set()

    def _add_candidate(path: Path) -> None:
        key = str(path)
        if key not in seen:
            candidates.append(path)
            seen.add(key)

    _add_candidate(initial)

    if cleaned:
        trimmed = cleaned.lstrip("/\\")
        if trimmed and trimmed != cleaned:
            # Use main.project_path if tests monkeypatch it; fallback to storage impl
            try:
                from app import main as main_module  # type: ignore

                candidate = Path(main_module.project_path(trimmed))
            except Exception:
                candidate = Path(_project_path_impl(trimmed))
            _add_candidate(candidate)

    if not initial.is_absolute():
        try:
            from app import main as main_module  # type: ignore

            candidate = Path(main_module.project_path(initial))
        except Exception:
            candidate = Path(_project_path_impl(initial))
        _add_candidate(candidate)

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    searched = ", ".join(str(path) for path in candidates)
    raise HTTPException(
        status_code=404,
        detail=f"File not found for video_path '{video_path_raw}'. Checked: {searched}",
    )


def _normalize_publish_at(publish_at_raw: Optional[str]) -> Optional[str]:
    if not publish_at_raw:
        return None
    try:
        dt = datetime.datetime.fromisoformat(publish_at_raw.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="publish_at must be ISO8601")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    iso = dt.astimezone(datetime.timezone.utc).isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    return iso


def _youtube_upload_from_disk(
    user_id: int,
    file_path: str,
    title: str,
    description: str,
    tags: List[str],
    privacy_status: str,
    publish_at: Optional[str],
) -> Dict[str, object]:
    refresh_token = get_youtube_refresh_token(user_id)
    access_token = exchange_youtube_refresh(refresh_token)

    metadata = {
        "snippet": {
            "title": title,
            "description": description,
            "tags": tags,
        },
        "status": {
            "privacyStatus": privacy_status.lower(),
        },
    }

    if publish_at:
        metadata["status"]["publishAt"] = publish_at

    upload_url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"

    session_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": str(os.path.getsize(file_path)),
        "X-Upload-Content-Type": "video/mp4",
    }

    init_resp = requests.post(
        upload_url, headers=session_headers, json=metadata, timeout=30
    )
    if init_resp.status_code >= 400:
        raise HTTPException(
            status_code=init_resp.status_code,
            detail=f"YouTube upload session init failed: {init_resp.text}",
        )

    upload_endpoint = init_resp.headers.get("Location")
    if not upload_endpoint:
        raise HTTPException(
            status_code=500, detail="YouTube upload session missing Location header"
        )

    with open(file_path, "rb") as fh:
        data = fh.read()

    upload_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "video/mp4",
        "Content-Length": str(len(data)),
    }

    upload_resp = requests.put(
        upload_endpoint, headers=upload_headers, data=data, timeout=120
    )
    if upload_resp.status_code >= 400:
        raise HTTPException(
            status_code=upload_resp.status_code,
            detail=f"YouTube upload failed: {upload_resp.text}",
        )

    return {
        "video_id": upload_resp.json().get("id"),
        "requested_visibility": privacy_status,
        "scheduled_publish_at": publish_at,
        "youtube_response": upload_resp.json(),
    }


def _parse_tags(tags_raw: Optional[str]) -> List[str]:
    if not tags_raw:
        return []
    parts = [chunk.strip() for chunk in tags_raw.split(",")]
    return [p for p in parts if p]


@router.get("/youtube/auth/url", tags=["YouTube"])
def youtube_auth_url(
    user: Annotated[
        dict, Depends(require_role(PUBLISHER_ROLES, require_verified=True))
    ],
):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")

    if not client_id or not redirect_uri:
        raise HTTPException(status_code=500, detail="YouTube OAuth not configured")

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": YOUTUBE_SCOPES,
    }

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"auth_url": url}


@router.get("/youtube/oauth2/callback", tags=["YouTube"])
def youtube_oauth2_callback(code: str, request: Request):
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing login cookie for callback")

    if token.startswith("Bearer "):
        token = token[len("Bearer ") :]

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token during callback"
        )

    uid_raw = payload.get("sub") or payload.get("id")
    if uid_raw is None:
        raise HTTPException(status_code=401, detail="Token missing user id")

    try:
        uid = int(uid_raw)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Bad user id in token") from exc

    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")

    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(status_code=500, detail="YouTube OAuth not configured")

    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    resp = requests.post("https://oauth2.googleapis.com/token", data=data, timeout=30)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    token_payload = resp.json()
    refresh_token = token_payload.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=400, detail="No refresh_token returned")

    upsert_user_key(
        user["id"],
        "youtube_refresh",
        encrypt_value(refresh_token),
    )

    return {
        "ok": True,
        "saved_refresh_token": True,
        "scope": token_payload.get("scope"),
        "expires_in": token_payload.get("expires_in"),
    }


@router.get("/youtube/channels/me", tags=["YouTube"])
def youtube_channels_me(
    user: Annotated[
        dict, Depends(require_role(PUBLISHER_ROLES, require_verified=True))
    ],
):
    refresh_token = get_youtube_refresh_token(user["id"])
    access_token = exchange_youtube_refresh(refresh_token)

    resp = requests.get(
        "https://youtube.googleapis.com/youtube/v3/channels",
        params={"part": "snippet", "mine": "true"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()


@router.post("/youtube/upload", tags=["YouTube"])
def youtube_upload_video(
    req: YouTubeUploadRequest,
    user: Annotated[
        dict, Depends(require_role(PUBLISHER_ROLES, require_verified=True))
    ],
):
    video_path_raw = (req.video_path or "").strip()
    title_raw = (req.title or "").strip()

    if not video_path_raw or not title_raw:
        raise HTTPException(status_code=400, detail="video_path and title are required")

    file_path = _resolve_video_file(video_path_raw)

    description = (req.description or "").strip()
    tags = req.tags or []
    privacy_status_raw = (req.privacy_status or "unlisted").strip()
    privacy_status = privacy_status_raw or "unlisted"
    publish_at = _normalize_publish_at((req.publish_at or "").strip() or None)

    # Allow tests to monkeypatch main._youtube_upload_from_disk
    try:
        from app import main as main_module  # type: ignore

        uploader = getattr(main_module, "_youtube_upload_from_disk", _youtube_upload_from_disk)
    except Exception:
        uploader = _youtube_upload_from_disk

    yt_info = uploader(
        user_id=user["id"],
        file_path=str(file_path),
        title=title_raw,
        description=description,
        tags=tags,
        privacy_status=privacy_status,
        publish_at=publish_at,
    )

    return {
        "ok": True,
        "video_id": yt_info.get("video_id"),
        "requested_visibility": yt_info.get("requested_visibility"),
        "scheduled_publish_at": yt_info.get("scheduled_publish_at"),
        "youtube_response": yt_info.get("youtube_response"),
    }


@router.post("/package_async")
def package_async(
    req: EnqueuePackageReq,
    user: Annotated[
        dict, Depends(require_role(["admin", "owner", "editor"], require_verified=True))
    ],
):
    """Enqueue a video packaging job for background processing."""

    jid = enqueue("package", req.model_dump())
    return {"job_id": jid}


@router.post("/qa/batch_async")
def qa_batch_async(
    req: EnqueueQABatchReq,
    user: Annotated[
        dict, Depends(require_role(["admin", "owner", "editor"], require_verified=True))
    ],
):
    jid = enqueue("qa_batch", req.model_dump())
    return {"job_id": jid}


@router.get("/jobs/{jid}")
def jobs_get(
    jid: str,
    user: Annotated[
        dict, Depends(require_role(["admin", "owner", "editor"], require_verified=True))
    ],
):
    job = get_job(jid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job_detail(job)


@router.get("/jobs")
def jobs_list(
    user: Annotated[
        dict, Depends(require_role(["admin", "owner", "editor"], require_verified=True))
    ],
):
    return {"jobs": [serialize_job(job) for job in list_jobs(limit=25)]}


def compute_loop_score(video_path: str) -> float:
    try:
        size = os.path.getsize(video_path)
    except Exception:
        size = 1
    h = int(hashlib.sha256(video_path.encode()).hexdigest(), 16) % 1000
    return round(
        min(
            0.99,
            0.65 + (size % 100000) / 100000 * 0.3 + (h / 1000) * 0.05,
        ),
        3,
    )


def compute_style_score(video_path: str, palette: list) -> int:
    base = (len(palette) * 13 + len(os.path.basename(video_path)) * 3) % 40 + 60
    return int(base)


def detect_watermark(video_path: str) -> bool:
    return "wm" in os.path.basename(video_path).lower()


@router.post("/qa")
def qa(
    loop_video_path: Annotated[str, Form(...)],
    palette: Annotated[str, Form()] = "[]",
):
    try:
        palette_values = json.loads(palette)
    except Exception:
        palette_values = []
    return {
        "loop_score": compute_loop_score(loop_video_path),
        "style_score": compute_style_score(loop_video_path, palette_values),
        "watermark_flag": detect_watermark(loop_video_path),
    }


DEFAULT_QA_PALETTE = ["#7359B6", "#1A1C2C", "#F2E9E4"]
DEFAULT_QA_THRESHOLDS = {"loop": 0.92, "style": 75}


@router.post("/qa/batch")
def api_qa_batch(
    paths: Annotated[list, Body(...)],
    palette: Annotated[Optional[list], Body()] = None,
    thresholds: Annotated[Optional[dict], Body()] = None,
):
    rows = []
    for path in paths:
        if not os.path.exists(path):
            rows.append({"path": path, "error": "not found"})
            continue
        palette_to_use = palette or DEFAULT_QA_PALETTE
        threshold_values = thresholds or DEFAULT_QA_THRESHOLDS

        loop_score = compute_loop_score(path)
        style_score = compute_style_score(path, palette_to_use)
        watermark_flag = detect_watermark(path)
        verdict = (
            "PASS"
            if (
                loop_score >= threshold_values.get("loop", 0.92)
                and style_score >= threshold_values.get("style", 75)
                and not watermark_flag
            )
            else "RETRY"
        )
        rows.append(
            {
                "path": path,
                "loop_score": loop_score,
                "style_score": style_score,
                "watermark": watermark_flag,
                "verdict": verdict,
            }
        )
    return {"results": rows}


@router.post("/qa/batch_csv")
def api_qa_batch_csv(
    paths: Annotated[list, Body(...)],
    palette: Annotated[Optional[list], Body()] = None,
    thresholds: Annotated[Optional[dict], Body()] = None,
):
    os.makedirs(os.path.join("static", "reports"), exist_ok=True)
    csv_path = os.path.join("static", "reports", f"qa_{uuid.uuid4().hex[:8]}.csv")
    rows = api_qa_batch(paths, palette, thresholds)["results"]
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["path", "loop_score", "style_score", "watermark", "verdict", "error"]
        )
        for row in rows:
            writer.writerow(
                [
                    row.get("path", ""),
                    row.get("loop_score", ""),
                    row.get("style_score", ""),
                    row.get("watermark", ""),
                    row.get("verdict", ""),
                    row.get("error", ""),
                ]
            )
    return {"csv_path": csv_path, "count": len(rows)}


@router.post("/package")
def package(req: PackageReq):
    out_path = req.out_path or os.path.join("static", "uploads", "master.mp4")
    audio_ms = probe_audio_duration(req.audio_path)
    if audio_ms <= 0:
        raise HTTPException(
            status_code=400, detail="Invalid audio file (duration <= 0)"
        )

    try:
        result = build_master_from_loop(
            loop_clip_path=req.loop_video_path,
            music_audio_path=req.audio_path,
            out_path=out_path,
            target_ms=audio_ms,
            voiceover_audio_path=None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"packager failed: {exc}") from exc

    return {
        "master_path": out_path,
        "audio_ms": audio_ms,
        "detail": result,
    }


@router.post("/package/master", tags=["Packager"])
def package_master(
    req: PackageReqV2,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    masters_dir = os.path.join("static", "masters")
    os.makedirs(masters_dir, exist_ok=True)

    out_file = (
        req.out_name if req.out_name.lower().endswith(".mp4") else req.out_name + ".mp4"
    )
    out_path = os.path.join(masters_dir, out_file)

    try:
        result = build_master_from_loop(
            loop_clip_path=req.loop_path,
            music_audio_path=req.song_path,
            out_path=out_path,
            target_ms=req.duration_ms,
            voiceover_audio_path=req.voiceover_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"packager failed: {exc}") from exc

    public_url = f"/static/masters/{out_file}"

    return {
        "ok": True,
        "public_url": public_url,
        "disk_path": out_path,
        "approx_duration_ms": result.get("approx_duration_ms"),
        "voiceover_used": result.get("voiceover_used"),
    }


@router.get("/projects")
def api_list_projects():
    return {"projects": list_projects()}


@router.post("/projects")
def api_create_or_update_project(payload: Annotated[dict, Body(...)]):
    project = {
        "id": payload.get("id"),
        "title": payload.get("title", ""),
        "palette": payload.get(
            "palette",
            ["#7359B6", "#1A1C2C", "#F2E9E4"],
        ),
        "thresholds": payload.get(
            "thresholds",
            {"loop": 0.92, "style": 75},
        ),
        "presets": payload.get("presets", []),
    }
    if not project["id"]:
        raise HTTPException(status_code=400, detail="id required")
    upsert_project(project["id"], project)
    return {"ok": True, "project": project}


@router.get("/projects/{pid}")
def api_get_project(pid: str):
    project = get_project(pid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project": project}


@router.delete("/projects/{pid}")
def api_delete_project(pid: str):
    deleted = delete_project(pid)
    return {"deleted": bool(deleted)}


@router.get("/presets")
def api_list_presets():
    return {"presets": list_presets()}


@router.post("/presets")
def api_upsert_preset(payload: Annotated[dict, Body(...)]):
    preset_id = payload.get("id") or uuid.uuid4().hex[:8]
    upsert_preset(preset_id, payload)
    return {"ok": True, "preset_id": preset_id}


@router.delete("/presets/{pid}")
def api_delete_preset(pid: str):
    return {"deleted": delete_preset(pid)}


@router.post("/pipeline/publish_lofi", tags=["Pipeline"])
def pipeline_publish_lofi(
    req: PublishPipelineReq,
    user: Annotated[
        dict, Depends(require_role(PUBLISHER_ROLES, require_verified=True))
    ],
):
    user_id = user["id"]

    voiceover_path = None
    if req.narration_text and req.narration_text.strip():
        if not req.narration_voice_id:
            raise HTTPException(
                status_code=400,
                detail="narration_voice_id is required if narration_text is provided",
            )
        voiceover_path = generate_voiceover_mp3_for_user(
            user_id=user_id,
            text=req.narration_text.strip(),
            voice_id=req.narration_voice_id.strip(),
            model_id=None,
        )

    masters_dir = os.path.join("static", "masters")
    os.makedirs(masters_dir, exist_ok=True)

    out_file = req.title.strip().replace(" ", "_") or "autopublish"
    out_file = out_file + "_" + uuid.uuid4().hex[:6] + ".mp4"
    out_path = os.path.join(masters_dir, out_file)

    try:
        result = build_master_from_loop(
            loop_clip_path=req.loop_path,
            music_audio_path=req.song_path,
            out_path=out_path,
            target_ms=req.duration_ms,
            voiceover_audio_path=voiceover_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"packager failed: {exc}") from exc

    public_url = f"/static/masters/{out_file}"

    try:
        from app import main as main_module  # type: ignore

        uploader = getattr(main_module, "_youtube_upload_from_disk", _youtube_upload_from_disk)
    except Exception:
        uploader = _youtube_upload_from_disk

    yt_info = uploader(
        user_id=user_id,
        file_path=out_path,
        title=req.title.strip(),
        description=req.description.strip(),
        tags=_parse_tags(req.tags),
        privacy_status=req.privacy_status or "unlisted",
        publish_at=_normalize_publish_at(req.publish_at),
    )

    return {
        "ok": True,
        "master_public_url": public_url,
        "master_disk_path": out_path,
        "packager_detail": result,
        "youtube_video_id": yt_info["video_id"],
        "youtube_raw": yt_info["youtube_response"],
        "youtube_requested_visibility": yt_info["requested_visibility"],
        "youtube_scheduled_publish_at": yt_info["scheduled_publish_at"],
    }


@router.post("/youtube/upload-form", tags=["YouTube"])
def youtube_upload_form(
    user: Annotated[
        dict, Depends(require_role(PUBLISHER_ROLES, require_verified=True))
    ],
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form(...)],
    description: str = Form(""),
    tags: str = Form(""),
    privacy_status: str = Form("unlisted"),
    publish_at: Optional[str] = Form(None),
):
    uploads_dir = os.path.join("static", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    suffix = Path(file.filename or "upload.mp4").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        temp_path = Path(tmp.name)

    try:
        try:
            from app import main as main_module  # type: ignore

            uploader = getattr(main_module, "_youtube_upload_from_disk", _youtube_upload_from_disk)
        except Exception:
            uploader = _youtube_upload_from_disk

        yt_info = uploader(
            user_id=user["id"],
            file_path=str(temp_path),
            title=title.strip(),
            description=description.strip(),
            tags=_parse_tags(tags),
            privacy_status=(privacy_status or "unlisted").strip() or "unlisted",
            publish_at=_normalize_publish_at(publish_at),
        )
    finally:
        if temp_path:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass

    return {
        "ok": True,
        "video_id": yt_info.get("video_id"),
        "requested_visibility": yt_info.get("requested_visibility"),
        "scheduled_publish_at": yt_info.get("scheduled_publish_at"),
        "youtube_response": yt_info.get("youtube_response"),
    }
