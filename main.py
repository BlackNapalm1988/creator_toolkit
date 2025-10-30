import csv
import datetime
import hashlib
import json
import logging
import math
import os
import secrets
import smtplib
import uuid
from email.message import EmailMessage
from typing import Dict, List, Optional

from dotenv import load_dotenv
from urllib.parse import urlencode

import requests

load_dotenv()

from fastapi import (
    FastAPI,
    APIRouter,
    UploadFile,
    File,
    Form,
    Body,
    Request,
    Response,
    HTTPException,
    Depends,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr

# --- modules ---
from modules.jobs import (
    init_jobs_db,
    enqueue,
    get_job,
    list_jobs,
    list_active_jobs,
    QueueWorker,
)
from modules.job_handlers import job_handle_package, job_handle_qa_batch
from modules.packager import build_master_from_loop, probe_audio_duration

from modules.chat import (
    init_chat_db,
    create_thread,
    get_thread,
    list_threads,
    add_message,
    get_messages,
)

from modules.storage import (
    list_projects,
    get_project,
    upsert_project,
    delete_project,
    list_presets,
    upsert_preset,
    delete_preset,
)

from modules.users import (
    init_db,
    create_user,
    get_user_by_email,
    get_user_by_id,
    update_user_profile,
    update_password_hash,
    upsert_user_key,
    list_user_keys,
    delete_user_key,
    set_verification_code,
    mark_email_verified,
    set_must_change_password,
    count_users,
    update_role,
)

from modules.auth import (
    hash_password,
    verify_password,
    encrypt_value,
    decrypt_value,
    decode_access_token,
    create_access_token,
    require_role as base_require_role,
)

from modules.system import (
    resolve_smtp_settings,
    get_public_smtp_settings,
    update_smtp_settings,
)


# --- logging / critical config ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- critical config ---
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = "dev_secret_change_me"
    os.environ.setdefault("JWT_SECRET", JWT_SECRET)
    logger.warning(
        "JWT_SECRET missing; using insecure development default. "
        "Set JWT_SECRET in your environment for production."
    )

DEFAULT_ADMIN_EMAIL = "admin@local"
DEFAULT_ADMIN_PASSWORD = "CHANGE_ME_NOW"

TEST_USER_PASSWORD = "password"
TEST_USER_ACCOUNTS = {
    "admin": "user_admin@testing.com",
    "owner": "user_owner@testing.com",
    "editor": "user_editor@testing.com",
    "viewer": "user_viewer@testing.com",
}

CREATOR_ROLES = ["admin", "owner", "editor"]
PUBLISHER_ROLES = ["admin", "owner"]

SMTP_TIMEOUT = int(os.getenv("SMTP_TIMEOUT_SECONDS") or 10)

# make sure these dirs exist
for d in ("static", "static/uploads", "static/reports", "ui", "data", "scenes"):
    os.makedirs(d, exist_ok=True)

auth_scheme = HTTPBearer(auto_error=False)

# Additional helper utilities


def _generate_verification_code() -> str:
    """Return a random six-digit verification code as a string."""

    return f"{secrets.randbelow(900000) + 100000}"


def _send_verification_email(recipient: str, code: str, full_name: str | None = None) -> bool:
    """Send a verification code email using the configured SMTP settings."""

    smtp_settings = resolve_smtp_settings()
    smtp_host = smtp_settings.get("host")
    smtp_port = int(smtp_settings.get("port") or 0)
    smtp_user = smtp_settings.get("username")
    smtp_password = smtp_settings.get("password")
    smtp_from = smtp_settings.get("from_address") or smtp_user
    smtp_use_tls = bool(smtp_settings.get("use_tls", True))

    if not recipient:
        logger.warning("No recipient provided for verification email; skipping send")
        return False

    if not smtp_host or not smtp_from:
        logger.warning("SMTP not configured; verification code for %s is %s", recipient, code)
        return False

    msg = EmailMessage()
    friendly_name = full_name or recipient
    msg["Subject"] = "Your Creator Toolkit verification code"
    msg["From"] = smtp_from
    msg["To"] = recipient
    body = (
        f"Hi {friendly_name},\n\n"
        "Here is your Creator Toolkit verification code: "
        f"{code}\n\n"
        "Enter this code in the dashboard to unlock API features.\n\n"
        "If you did not request this code, you can ignore this email."
    )
    msg.set_content(body)

    try:
        with smtplib.SMTP(smtp_host, smtp_port or 0, timeout=SMTP_TIMEOUT) as smtp:
            if smtp_use_tls:
                try:
                    smtp.starttls()
                except smtplib.SMTPException:
                    logger.debug("SMTP server did not accept STARTTLS; continuing without TLS")
            if smtp_user and smtp_password:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(msg)
        logger.info("Sent verification email to %s", recipient)
        return True
    except Exception as exc:  # pragma: no cover - network dependent
        logger.warning("Could not send verification email to %s: %s", recipient, exc)
        return False


def bootstrap_test_users() -> Dict[str, int]:
    """Ensure each role has a ready-to-use test account."""

    created: Dict[str, int] = {}
    for role, email in TEST_USER_ACCOUNTS.items():
        if get_user_by_email(email):
            continue

        user_id = create_user(
            email,
            f"{role.title()} Test User",
            hash_password(TEST_USER_PASSWORD),
            access_group="Testers",
            is_verified=True,
            role=role,
            must_change_password=False,
        )
        created[role] = user_id

    if created:
        created_summary = ", ".join(
            f"{role}:{TEST_USER_ACCOUNTS[role]}" for role in sorted(created)
        )
        logger.info("Bootstrapped test users: %s", created_summary)

    return created


def bootstrap_default_admin() -> Optional[int]:
    """Ensure a default admin user exists on first run."""

    created_admin_id: Optional[int] = None
    if not count_users():
        password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        created_admin_id = create_user(
            DEFAULT_ADMIN_EMAIL,
            "System Administrator",
            password_hash,
            access_group="Dev",
            is_verified=True,
            role="admin",
            must_change_password=True,
        )
        logger.info(
            "Created default admin user %s with temporary password requirement",
            DEFAULT_ADMIN_EMAIL,
        )

    bootstrap_test_users()
    return created_admin_id


def current_user(request: Request, credentials=Depends(auth_scheme)):
    """Resolve the authenticated user based on bearer token or cookie."""

    # 1. Pull token from Authorization header or cookie
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    if not token:
        token = request.cookies.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    if token.startswith("Bearer "):
        token = token[len("Bearer "):]

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    uid_raw = payload.get("sub") or payload.get("id")
    if uid_raw is None:
        raise HTTPException(status_code=401, detail="Token missing 'sub' or 'id'")

    try:
        uid = int(uid_raw)
    except Exception:
        raise HTTPException(status_code=401, detail="Bad id in token")

    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if "email" not in user and payload.get("email"):
        user["email"] = payload["email"]

    return user


def require_role(allowed_roles, *, require_verified: bool = False):
    """Return dependency enforcing a user's role (and optional verification)."""

    return base_require_role(
        allowed_roles,
        dependency=current_user,
        require_verified=require_verified,
    )


def _user_payload(u: dict) -> dict:
    """Return the subset of user columns that should be exposed externally."""

    role = (u.get("role") or "viewer").lower()
    return {
        "id": u["id"],
        "email": u.get("email"),
        "full_name": u.get("full_name"),
        "access_group": u.get("access_group", "User"),
        "is_verified": bool(u.get("is_verified")),
        "role": role,
        "must_change_password": bool(u.get("must_change_password")),
    }


def verified_user(user=Depends(current_user)):
    """Dependency that requires the user to have completed email verification."""

    if not user.get("is_verified"):
        raise HTTPException(status_code=403, detail="Email verification required")
    return user


def dev_user(user=Depends(verified_user)):
    """Dependency restricting access to members of the ``Dev`` access group."""

    if (user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ----------------------------
# OPENAI / IMAGINE CONFIG
# ----------------------------

ALLOWED_OPENAI_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "o4-mini",
]
OPENAI_MODEL = "gpt-4o-mini"

app = FastAPI(
    title="Creator Toolkit",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

admin_router = APIRouter(prefix="/admin/system", tags=["Admin"])

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/openapi.json", include_in_schema=False)
def custom_openapi(user=Depends(dev_user)):
    """Expose the generated OpenAPI schema to verified developers."""

    return JSONResponse(app.openapi())


@app.get("/docs", include_in_schema=False)
def custom_docs(user=Depends(dev_user)):
    """Serve Swagger UI for developers while keeping it hidden from public."""

    return get_swagger_ui_html(openapi_url="/openapi.json", title="Creator Toolkit API Docs")


# init databases we'll need
init_db()         # users / profile
bootstrap_default_admin()
init_jobs_db()    # job queue
init_chat_db()    # imagine chat history

# ----------------------------
# IMAGINE (ChatGPT-style chat)
# ----------------------------

class ImagineThreadCreateReq(BaseModel):
    model: str | None = None
    title: str | None = None

class ImagineSendReq(BaseModel):
    thread_id: str
    message: str

class VideoGenReq(BaseModel):
    prompt: str
    duration_seconds: int = 4
    size: str | None = "720x1280"
    aspect_ratio: str | None = None
    loop_hint: bool = True

class VideoStatusReq(BaseModel):
    job_id: str

class MusicGenReq(BaseModel):
    prompt: str = "lofi hip hop beat, warm, cozy, no vocals, vinyl crackle"
    duration_seconds: int = 180  # try ~3 min
    mood: str | None = "chill"
    genre: str | None = "lofi"

class MusicStatusReq(BaseModel):
    job_id: str


def _get_openai_key_for_user(user_id: int) -> str:
    """Retrieve and decrypt the stored OpenAI API key for ``user_id``."""

    raw = list_user_keys(user_id)
    cipher = raw.get("openai")
    if not cipher:
        raise HTTPException(
            status_code=400,
            detail="No OpenAI API key on file. Save one via /profile/keys.",
        )
    return decrypt_value(cipher)


def _get_eleven_key_for_user(user_id: int) -> str:
    """Return the decrypted ElevenLabs key for ``user_id``."""

    raw = list_user_keys(user_id)
    cipher = raw.get("elevenlabs")
    if not cipher:
        raise HTTPException(
            status_code=400,
            detail="No ElevenLabs API key on file. Save one via /profile/keys.",
        )
    return decrypt_value(cipher)

# def _get_eleven_key_for_user(user_id: int) -> str:
#     row = list_user_keys(user_id, "elevenlabs")  # <- assumes you store provider="elevenlabs"
#     if not row:
#         raise HTTPException(status_code=400, detail="No ElevenLabs key on file for this user")
#     secret = decrypt_value(row["secret"])
#     if not secret:
#         raise HTTPException(status_code=500, detail="Could not decrypt ElevenLabs key")
#     return secret


YOUTUBE_SCOPES = (
    "https://www.googleapis.com/auth/youtube.readonly "
    "https://www.googleapis.com/auth/youtube.upload"
)

def _get_youtube_refresh(user_id: int) -> str:
    """Load the encrypted YouTube refresh token for a user."""

    raw = list_user_keys(user_id)
    cipher = raw.get("youtube_refresh")
    if not cipher:
        raise HTTPException(
            status_code=400,
            detail="No YouTube refresh token on file. Hit /youtube/auth/url and finish OAuth.",
        )
    return decrypt_value(cipher)


def _youtube_get_access_token(refresh_token: str) -> str:
    """Exchange a stored refresh token for a short-lived access token."""

    data = {
        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    r = requests.post(
        "https://oauth2.googleapis.com/token",
        data=data,
        timeout=30,
    )
    # Google’s token endpoint will exchange a long-lived refresh_token for a short-lived access_token
    # used as Authorization: Bearer <token> for YouTube API calls.

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    js = r.json()
    at = js.get("access_token")
    if not at:
        raise HTTPException(status_code=500, detail="No access_token in refresh response")
    return at


def _normalize_publish_at(publish_at_raw: Optional[str]) -> Optional[str]:
    """Validate and normalize an optional scheduled publish timestamp."""

    if not publish_at_raw:
        return None
    value = publish_at_raw.strip()
    if not value:
        return None

    normalized = value.replace(" ", "T", 1) if " " in value and "T" not in value else value
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    try:
        dt = datetime.datetime.fromisoformat(normalized)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="publish_at must be an ISO 8601 datetime (example: 2025-10-27T20:00:00Z)",
        )

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    else:
        dt = dt.astimezone(datetime.timezone.utc)

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if dt <= now_utc:
        raise HTTPException(status_code=400, detail="publish_at must be in the future")

    return dt.isoformat().replace("+00:00", "Z")


def _youtube_upload_from_disk(
    user_id: int,
    file_path: str,
    title: str,
    description: str,
    tags: str,
    privacy_status: str,
    publish_at: Optional[str] = None,
) -> dict:
    """Upload a prepared mp4 to YouTube using the stored refresh token."""

    refresh_token = _get_youtube_refresh(user_id)
    access_token = _youtube_get_access_token(refresh_token)

    # read file bytes
    with open(file_path, "rb") as f:
        video_bytes = f.read()

    # parse tags
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    snippet = {
        "title": title,
        "description": description,
    }
    if tag_list:
        snippet["tags"] = tag_list

    desired_visibility = (privacy_status or "unlisted").strip().lower()
    allowed_visibilities = {"public", "unlisted", "private"}
    if desired_visibility not in allowed_visibilities:
        raise HTTPException(
            status_code=400,
            detail=f"privacy_status must be one of {', '.join(sorted(allowed_visibilities))}",
        )

    scheduled_iso = _normalize_publish_at(publish_at)
    if scheduled_iso and desired_visibility != "public":
        raise HTTPException(
            status_code=400,
            detail="Scheduled publish is only supported when visibility is set to 'public'.",
        )

    status_privacy = desired_visibility
    status_obj = {
        "privacyStatus": status_privacy if not scheduled_iso else "private"
    }
    if scheduled_iso:
        status_obj["publishAt"] = scheduled_iso

    metadata_obj = {
        "snippet": snippet,
        "status": status_obj
    }

    metadata_json = json.dumps(metadata_obj)
    boundary = "==============CREATOR_TOOLKIT_" + uuid.uuid4().hex

    part1_headers = (
        f"--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata_json}\r\n"
    )

    part2_headers = (
        f"--{boundary}\r\n"
        "Content-Type: video/mp4\r\n\r\n"
    )

    closing = f"\r\n--{boundary}--\r\n"

    body_bytes = (
        part1_headers.encode("utf-8") +
        part2_headers.encode("utf-8") +
        video_bytes +
        closing.encode("utf-8")
    )

    upload_url = "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": f"multipart/related; boundary={boundary}",
    }

    r = requests.post(upload_url, headers=headers, data=body_bytes, timeout=90)

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=f"YouTube upload error: {r.text}")

    try:
        yt_resp = r.json()
    except Exception:
        raise HTTPException(status_code=500, detail="YouTube upload succeeded but JSON parse failed")

    return {
        "video_id": yt_resp.get("id"),
        "youtube_response": yt_resp,
        "requested_visibility": desired_visibility,
        "scheduled_publish_at": scheduled_iso,
    }


def _parse_tags(tags_raw: Optional[str]) -> List[str]:
    """Split a comma-delimited tag string into a clean list."""

    if not tags_raw:
        return []
    # user sends: "lofi, rainy night, chill study beats"
    # we return ["lofi", "rainy night", "chill study beats"]
    return [t.strip() for t in tags_raw.split(",") if t.strip()]


def _dashboard_shell(request: Request, *, active_view: str = "view-dashboard") -> HTMLResponse:
    """Render the dashboard shell with the requested active view highlighted."""

    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "active_view": active_view},
    )


@app.get("/dashboard", response_class=HTMLResponse, tags=["UI"])
def dashboard_page(request: Request):
    """Render the dashboard shell with the main dashboard view active."""

    return _dashboard_shell(request, active_view="view-dashboard")


@app.get("/imagine", response_class=HTMLResponse, tags=["UI"])
def imagine_page(request: Request):
    """Render the dashboard shell focused on the Imagine workspace."""

    return _dashboard_shell(request, active_view="view-imagine")


@app.get("/create", response_class=HTMLResponse, tags=["UI"])
def create_page(request: Request):
    """Render the dashboard shell focused on the Create workspace."""

    return _dashboard_shell(request, active_view="view-create")


@app.get("/system", response_class=HTMLResponse, tags=["UI"])
def system_page(request: Request):
    """Render the dashboard shell with the System panel selected."""

    return _dashboard_shell(request, active_view="view-system")


def _to_iso(ts: int | None) -> str | None:
    if not ts:
        return None
    try:
        return datetime.datetime.fromtimestamp(int(ts), tz=datetime.timezone.utc).isoformat()
    except Exception:
        return None


def _serialize_job(job: Dict[str, object]) -> Dict[str, object]:
    raw_progress = job.get("progress")
    try:
        progress_value = int(raw_progress) if raw_progress is not None else None
    except (TypeError, ValueError):
        progress_value = None

    updated_raw = job.get("updated_at")
    if isinstance(updated_raw, (int, float)):
        updated_value = _to_iso(int(updated_raw))
    elif isinstance(updated_raw, str):
        updated_value = updated_raw
    else:
        updated_value = None

    return {
        "id": job.get("id"),
        "type": job.get("type"),
        "status": job.get("status"),
        "stage": job.get("stage"),
        "progress": progress_value,
        "updated_at": updated_value,
        "error_message": job.get("error_message"),
    }


def _serialize_job_detail(job: Dict[str, object]) -> Dict[str, object]:
    detail = _serialize_job(job)
    created_raw = job.get("created_at")
    if isinstance(created_raw, (int, float)):
        created_value = _to_iso(int(created_raw))
    elif isinstance(created_raw, str):
        created_value = created_raw
    else:
        created_value = None
    detail.update(
        {
            "created_at": created_value,
            "duration_ms": job.get("duration_ms"),
        }
    )
    return detail


@app.get("/dashboard/data", tags=["Dashboard"])
def dashboard_data(user=Depends(current_user)):
    """Return aggregated dashboard data for the signed-in user."""

    # --- user summary ---
    payload = _user_payload(user)
    user_summary = {
        "id": payload.get("id"),
        "display_name": payload.get("full_name") or payload.get("email"),
        "access_group": payload.get("access_group"),
        "email_verified": bool(payload.get("is_verified")),
        "role": payload.get("role"),
        "must_change_password": bool(payload.get("must_change_password")),
    }

    # --- provider connection status ---
    stored_keys = list_user_keys(payload["id"])
    providers = {}
    for provider in ("openai", "elevenlabs", "youtube"):
        providers[provider] = "connected" if stored_keys.get(provider) else "missing"

    recent_jobs = [_serialize_job(job) for job in list_jobs(limit=10)]

    active_jobs = [_serialize_job(job) for job in list_active_jobs(limit=10)]

    # --- assets placeholder ---
    recent_assets: List[Dict[str, str]] = []

    return {
        "user": user_summary,
        "providers": providers,
        "recent_jobs": recent_jobs,
        "active_jobs": active_jobs,
        "recent_assets": recent_assets,
    }

@app.get("/imagine/models")
def imagine_models(user=Depends(require_role(CREATOR_ROLES, require_verified=True))):
    """Return the list of allowed OpenAI chat models."""

    return {"models": ALLOWED_OPENAI_MODELS, "default": OPENAI_MODEL}

@app.post("/imagine/thread")
def imagine_thread_create(
    req: ImagineThreadCreateReq,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """Create a new chat thread for brainstorming prompts."""

    model = (req.model or OPENAI_MODEL)
    if model not in ALLOWED_OPENAI_MODELS:
        raise HTTPException(status_code=400, detail="Model not allowed")

    tid = f"im_{uuid.uuid4().hex[:10]}"
    create_thread(tid, user["id"], model, req.title or "New chat")

    # prime the thread with a system message so style is consistent
    add_message(
        tid,
        "system",
        "You are a helpful creative copilot for short-form image/video workflows."
    )

    return {"thread_id": tid}

@app.get("/imagine/threads")
def imagine_threads_list(
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """Return recent imagine threads for the signed-in user."""

    return {"threads": list_threads(user["id"])}

@app.get("/imagine/history/{thread_id}")
def imagine_history(
    thread_id: str,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """Fetch a thread plus the last N messages for review."""

    th = get_thread(thread_id)
    if not th:
        raise HTTPException(status_code=404, detail="thread not found")
    if th["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="forbidden")

    return {
        "thread": th,
        "messages": get_messages(thread_id, limit=60)
    }

@app.post("/imagine/send")
def imagine_send(
    req: ImagineSendReq,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """Send a chat message and stream the assistant's reply back."""

    th = get_thread(req.thread_id)
    if not th:
        raise HTTPException(status_code=404, detail="thread not found")
    if th["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="forbidden")

    # save user's message
    content = (req.message or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="message cannot be empty")
    add_message(req.thread_id, "user", content)

    # call OpenAI with user's saved key
    key = _get_openai_key_for_user(user["id"])

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)

        history = get_messages(req.thread_id, limit=40)
        messages = [{"role": m["role"], "content": m["content"]} for m in history]

        model = th["model"]
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            top_p=1,
            max_tokens=800,
        )
        reply = resp.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {e}")

    add_message(req.thread_id, "assistant", reply)
    return {"reply": reply}

# ----------------------------
# ELEVENLABS ENDPOINTS
# ----------------------------

@app.get("/elevenlabs/voices", tags=["ElevenLabs"])
def eleven_list_voices(
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Return a clean list of voices the user can pick from:
    [
      { "voice_id": "...", "name": "Calm Narrator" },
      { "voice_id": "...", "name": "City Radio Host" },
      ...
    ]
    """

    api_key = _get_eleven_key_for_user(user["id"])

    headers = {
        "xi-api-key": api_key,
        "Accept": "application/json",
    }

    # This is ElevenLabs' standard voices list endpoint for your voices / library voices.
    url = "https://api.elevenlabs.io/v1/voices"

    try:
        r = requests.get(url, headers=headers, timeout=30)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Network error contacting ElevenLabs: {e}")

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    data = r.json()

    # We’ll try to normalize. Different plans return slightly different shapes.
    # Usually you get { "voices": [ { "voice_id": "...", "name": "..." }, ... ] }
    voices_raw = data.get("voices") or []

    simplified = []
    for v in voices_raw:
        vid = v.get("voice_id")
        nm = v.get("name")
        if vid and nm:
            simplified.append({
                "voice_id": vid,
                "name": nm,
            })

    # If simplified is empty, then you're probably on a tier where voices list isn't exposed
    # and they only return model info. We fall back to returning the raw response so you can inspect it.
    if not simplified:
        return {
            "ok": True,
            "voices": [],
            "note": "No direct voices returned; showing raw API response for debugging.",
            "raw": data,
        }

    return {
        "ok": True,
        "count": len(simplified),
        "voices": simplified,
    }


@app.post("/elevenlabs/generate", tags=["ElevenLabs"])
def eleven_generate_tts(
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
    text: str = Form(...),
    voice_id: Optional[str] = Form(None),
    model_id: Optional[str] = Form(None),
):
    """
    Generate speech audio from ElevenLabs for the given text.
    Saves an MP3 file under static/tts and returns info about it.
    """

    api_key = _get_eleven_key_for_user(user["id"])

    # If no voice_id was provided, try to pick a default by querying /voices
    if not voice_id:
        headers_tmp = {
            "xi-api-key": api_key,
            "Accept": "application/json",
        }
        voices_resp = requests.get(
            "https://api.elevenlabs.io/v1/voices",
            headers=headers_tmp,
            timeout=30,
        )
        if voices_resp.status_code < 400:
            voices_json = voices_resp.json()
            voices_list = voices_json.get("voices") or []
            if voices_list:
                # take first voice as default
                voice_id = voices_list[0].get("voice_id")

    if not voice_id:
        raise HTTPException(
            status_code=400,
            detail="No voice_id provided and no default voice could be determined. Call /elevenlabs/voices to inspect."
        )

    # ensure output dir exists
    out_dir = os.path.join("static", "tts")
    os.makedirs(out_dir, exist_ok=True)

    out_name = f"{user['id']}_{uuid.uuid4().hex}.mp3"
    out_path = os.path.join(out_dir, out_name)

    payload = {
        "text": text,
    }
    if model_id:
        payload["model_id"] = model_id

    headers = {
        "xi-api-key": api_key,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }

    tts_url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    try:
        resp = requests.post(
            tts_url,
            headers=headers,
            data=json.dumps(payload),
            timeout=60,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Network error contacting ElevenLabs: {e}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    audio_bytes = resp.content
    if not audio_bytes or len(audio_bytes) < 10:
        raise HTTPException(status_code=500, detail="ElevenLabs returned empty audio")

    try:
        with open(out_path, "wb") as f:
            f.write(audio_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save MP3: {e}")

    public_url = f"/static/tts/{out_name}"

    return {
        "ok": True,
        "file_name": out_name,
        "file_url": public_url,
        "bytes": len(audio_bytes),
        "voice_id_used": voice_id,
        "model_id_used": model_id,
        "text_preview": text[:120],
    }

def _generate_voiceover_mp3_for_user(
    user_id: int,
    text: str,
    voice_id: str,
    model_id: Optional[str] = None,
) -> str:
    """Generate speech audio using the user's ElevenLabs credentials."""

    api_key = _get_eleven_key_for_user(user_id)

    # prepare output path
    out_dir = os.path.join("static", "tts")
    os.makedirs(out_dir, exist_ok=True)
    out_name = f"{user_id}_{uuid.uuid4().hex}.mp3"
    out_path = os.path.join(out_dir, out_name)

    payload = {
        "text": text,
    }
    if model_id:
        payload["model_id"] = model_id

    headers = {
        "xi-api-key": api_key,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }

    tts_url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    resp = requests.post(
        tts_url,
        headers=headers,
        data=json.dumps(payload),
        timeout=60,
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs error: {resp.text}")

    audio_bytes = resp.content
    if not audio_bytes or len(audio_bytes) < 10:
        raise HTTPException(status_code=500, detail="ElevenLabs returned empty audio")

    with open(out_path, "wb") as f:
        f.write(audio_bytes)

    return out_path  # disk path

class ImagineChatReq(BaseModel):
    message: str

class ImagineChatResp(BaseModel):
    reply: str

@app.post("/imagine/chat", response_model=ImagineChatResp, tags=["Imagine"])
def imagine_chat(
    req: ImagineChatReq,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Lightweight 'writer's room' chat.
    Uses the user's saved OpenAI key to get creative guidance for visual/music ideas.
    """

    user_id = user["id"]
    openai_key = _get_openai_key_for_user(user_id)

    # We'll build a short system prompt to keep the assistant focused on your workflow:
    system_msg = (
        "You are a creative assistant for a shortform lo-fi / moody / aesthetic video channel. "
        "You help brainstorm looping visual ideas, mood direction, aesthetic keywords, "
        "and audio direction for YouTube Shorts / TikTok style content using AI video + AI music. "
        "Keep responses specific, visual, and production-ready."
    )

    # IMPORTANT:
    # We're going to hit the OpenAI Chat Completions API (JSON) using the user's key.
    # We'll assume a modern gpt model like 'gpt-5o-mini' or similar.
    # If you already know which model you're using for prompts, put it there.
    # openai_model = "gpt-5o-mini"  # <-- adjust if you prefer something else in your account

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": req.message.strip()},
        ],
        "temperature": 0.7,
    }

    try:
        r = requests.post(url, headers=headers, json=body, timeout=60)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Network error contacting OpenAI chat API: {e}",
        )

    if r.status_code >= 400:
        # Bubble back error text so you can see what's wrong in the UI
        raise HTTPException(
            status_code=r.status_code,
            detail=f"OpenAI chat API error: {r.text}",
        )

    data = r.json()

    # Extract assistant message
    try:
        reply_text = data["choices"][0]["message"]["content"]
    except Exception:
        reply_text = "(no reply from model)"

    return {"reply": reply_text}

@app.post("/generate/music", tags=["Generate"])
def generate_music(
    req: MusicGenReq,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Kick off ElevenLabs music generation.
    Returns either:
      - ready track info (and we'll save it), OR
      - a job_id to poll with /generate/music/status.
    """
    user_id = user["id"]
    xi_key = _get_eleven_key_for_user(user_id)

    # Build request body for ElevenLabs.
    # We'll start with our best guess, and refine based on error messages.
    # The idea: tell it what vibe we want, and how long.
    music_payload = {
        "prompt": req.prompt,
        "duration_seconds": req.duration_seconds,
        "mood": req.mood,
        "genre": req.genre,
        # If their API expects arrays (e.g. ["lofi","chill"]), we can adapt once we see 400 errors.
    }

    # Clean out None values so we don't send nulls they might not like
    music_payload = {k: v for k, v in music_payload.items() if v is not None}

    headers = {
        "xi-api-key": xi_key,
        "Content-Type": "application/json",
    }

    try:
        el_resp = requests.post(
            "https://api.elevenlabs.io/v1/music",
            headers=headers,
            json=music_payload,
            timeout=120,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Network error contacting ElevenLabs Music: {e}",
        )

    if el_resp.status_code >= 400:
        # Super important: this error text will tell us if the field names differ.
        raise HTTPException(
            status_code=el_resp.status_code,
            detail=f"ElevenLabs music API error: {el_resp.text}",
        )

    ctype = el_resp.headers.get("Content-Type", "").lower()

    music_dir = os.path.join("static", "music")
    os.makedirs(music_dir, exist_ok=True)

    # CASE 1: We get JSON describing a job, like { "id": "...", "status": "queued" }
    if "application/json" in ctype:
        try:
            payload = el_resp.json()
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="ElevenLabs returned JSON but we couldn't parse it",
            )

        status = payload.get("status", "unknown")

        # If it's queued / processing, return job info so UI can poll
        if status in ("queued", "processing", "running", "generating"):
            return {
                "ok": True,
                "status": status,
                "provider_job_id": payload.get("id") or payload.get("job_id"),
                "message": "Music is generating. Poll /generate/music/status with job_id.",
                "raw": payload,
            }

        # If it's completed and they give us a URL or base64:
        audio_url = (
            payload.get("audio_url")
            or payload.get("music_url")
            or payload.get("url")
            or payload.get("result_url")
        )
        audio_b64 = payload.get("audio_b64") or payload.get("music_b64")

        # We'll generate a filename for this user and timestamp
        ts_tag = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
        out_name = f"track_{user_id}_{ts_tag}.mp3"
        out_disk_path = os.path.join(music_dir, out_name)

        if audio_b64:
            import base64
            audio_bytes = base64.b64decode(audio_b64)
            if len(audio_bytes) < 20000:  # ~20KB sanity check
                raise HTTPException(
                    status_code=500,
                    detail="Music base64 too small; not treating as valid audio",
                )
            with open(out_disk_path, "wb") as f:
                f.write(audio_bytes)

            return {
                "ok": True,
                "status": "ready",
                "song_path": f"static/music/{out_name}".replace("\\", "/"),
                "note": "Generated via ElevenLabs (JSON->base64 path)",
            }

        if audio_url:
            dl = requests.get(audio_url, headers=headers, timeout=120)
            if dl.status_code >= 400:
                raise HTTPException(
                    status_code=500,
                    detail=f"Could not download ElevenLabs audio_url: {dl.text}",
                )
            audio_bytes = dl.content
            if len(audio_bytes) < 20000:
                raise HTTPException(
                    status_code=500,
                    detail="Downloaded audio too small; looks invalid.",
                )
            with open(out_disk_path, "wb") as f:
                f.write(audio_bytes)

            return {
                "ok": True,
                "status": "ready",
                "song_path": f"static/music/{out_name}".replace("\\", "/"),
                "note": "Generated via ElevenLabs (JSON->url path)",
            }

        # If no bytes were included (pure metadata, like “done” but no URL?),
        # just return payload and we’ll handle in /generate/music/status.
        return {
            "ok": True,
            "status": status,
            "provider_job_id": payload.get("id") or payload.get("job_id"),
            "note": "No audio bytes yet. Poll /generate/music/status.",
            "raw": payload,
        }

    # CASE 2: If they ever stream audio directly back (Content-Type: audio/mpeg, etc.)
    audio_bytes = el_resp.content
    if len(audio_bytes) < 20000:
        raise HTTPException(
            status_code=500,
            detail="ElevenLabs returned tiny binary; not treating as valid audio.",
        )

    ts_tag = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    out_name = f"track_{user_id}_{ts_tag}.mp3"
    out_disk_path = os.path.join(music_dir, out_name)

    with open(out_disk_path, "wb") as f:
        f.write(audio_bytes)

    return {
        "ok": True,
        "status": "ready",
        "song_path": f"static/music/{out_name}".replace("\\", "/"),
        "note": "Generated via ElevenLabs (direct binary path)",
    }

@app.get("/generate/music/status", tags=["Generate"])
def get_music_status(
    job_id: str,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Poll ElevenLabs about a music generation job.
    If finished, download the audio and save it.
    """
    user_id = user["id"]
    xi_key = _get_eleven_key_for_user(user_id)

    headers = {
        "xi-api-key": xi_key,
    }

    # We have to guess the polling endpoint shape, because different ElevenLabs
    # betas use either /v1/music/{id} or /v1/music/tasks/{id}.
    # We'll try /v1/music/{job_id} first; if it 404s, we fall back to /v1/music/tasks/{job_id}.
    poll_urls = [
        f"https://api.elevenlabs.io/v1/music/{job_id}",
        f"https://api.elevenlabs.io/v1/music/tasks/{job_id}",
    ]

    last_resp = None
    for url in poll_urls:
        r = requests.get(url, headers=headers, timeout=60)
        last_resp = r
        if r.status_code < 400:
            break  # success
    if last_resp is None or last_resp.status_code >= 400:
        raise HTTPException(
            status_code=last_resp.status_code if last_resp else 500,
            detail=f"Failed to poll ElevenLabs music status: {last_resp.text if last_resp else 'no response'}",
        )

    try:
        payload = last_resp.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Music status response was not JSON")

    status = payload.get("status", "unknown")

    # still generating?
    if status in ("queued", "processing", "running", "generating"):
        return {
            "ok": True,
            "status": status,
            "job_id": job_id,
            "progress": payload.get("progress"),
            "duration": payload.get("duration_seconds") or payload.get("duration"),
        }

    if status == "failed":
        raise HTTPException(
            status_code=500,
            detail=payload.get("error", "Music generation failed"),
        )

    # completed: now grab the audio
    if status in ("completed", "succeeded", "ready"):
        music_dir = os.path.join("static", "music")
        os.makedirs(music_dir, exist_ok=True)

        ts_tag = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
        out_name = f"track_{user_id}_{ts_tag}.mp3"
        out_disk_path = os.path.join(music_dir, out_name)

        # try common patterns:
        audio_url = (
            payload.get("audio_url")
            or payload.get("music_url")
            or payload.get("url")
            or payload.get("result_url")
        )
        audio_b64 = payload.get("audio_b64") or payload.get("music_b64")

        if audio_b64:
            import base64
            audio_bytes = base64.b64decode(audio_b64)
            if len(audio_bytes) < 20000:
                raise HTTPException(
                    status_code=500,
                    detail="Final music base64 too small; not valid audio",
                )
            with open(out_disk_path, "wb") as f:
                f.write(audio_bytes)

            return {
                "ok": True,
                "status": "ready",
                "song_path": f"static/music/{out_name}".replace("\\", "/"),
            }

        if audio_url:
            dl = requests.get(audio_url, headers=headers, timeout=120)
            if dl.status_code >= 400:
                raise HTTPException(
                    status_code=500,
                    detail=f"Download of ElevenLabs audio_url failed: {dl.text}",
                )
            audio_bytes = dl.content
            if len(audio_bytes) < 20000:
                raise HTTPException(
                    status_code=500,
                    detail="Downloaded audio too small; not valid audio",
                )
            with open(out_disk_path, "wb") as f:
                f.write(audio_bytes)

            return {
                "ok": True,
                "status": "ready",
                "song_path": f"static/music/{out_name}".replace("\\", "/"),
            }

        return {
            "ok": False,
            "status": status,
            "note": "Job finished but no audio asset fields found",
            "raw": payload,
        }

    # fallback
    return {
        "ok": False,
        "status": status,
        "raw": payload,
    }



@app.post("/generate/video", tags=["Generate"])
def generate_video(
    req: VideoGenReq,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Ask Sora 2 for a clip and (if possible) request a custom duration + aspect.
    Falls back to polling /generate/video/status if we only get metadata back.
    """

    user_id = user["id"]
    openai_key = _get_openai_key_for_user(user_id)

    size_raw = (req.size or req.aspect_ratio or "720x1280").strip().lower()
    if "x" not in size_raw:
        raise HTTPException(
            status_code=400,
            detail="size must be provided as 'widthxheight', for example '720x1280'",
        )

    width_str, height_str = size_raw.split("x", 1)
    try:
        width = int(width_str)
        height = int(height_str)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="size must contain integer width and height, e.g. '720x1280'",
        )

    if width <= 0 or height <= 0:
        raise HTTPException(
            status_code=400,
            detail="size width and height must be positive integers",
        )

    normalized_size = f"{width}x{height}"

    aspect_for_prompt = req.aspect_ratio
    if not aspect_for_prompt:
        gcd = math.gcd(width, height)
        if gcd:
            aspect_for_prompt = f"{width // gcd}:{height // gcd}"
        else:
            aspect_for_prompt = f"{width}:{height}"

    # Build creative prompt text
    prompt_bits = [req.prompt.strip()]

    if req.loop_hint:
        prompt_bits.append(
            "Make this a seamless looping clip with no visible jump between the end frame and the first frame."
        )

    prompt_bits.append(
        f"Cinematic motion, stable composition. Aspect ratio {aspect_for_prompt}. Soft camera movement, no hard cuts."
    )

    final_prompt = " ".join(prompt_bits)

    # --- IMPORTANT ---
    # We want multipart/form-data, but with *text* fields, not files.
    # requests does that if you ONLY pass `files=` and each value is (None, "text").
    # That yields proper multipart/form-data with no filename=.
    multipart_fields = {
        "model": (None, "sora-2"),
        "prompt": (None, final_prompt),
        # these 2 are our "please do 15s 9:16" hints; model may ignore but we send them anyway
        "seconds": (None, str(req.duration_seconds)),
        "size": (None, normalized_size),
    }

    headers = {
        "Authorization": f"Bearer {openai_key}",
        # DO NOT set Content-Type manually. requests will add the multipart boundary.
    }

    try:
        sora_resp = requests.post(
            "https://api.openai.com/v1/videos",
            headers=headers,
            files=multipart_fields,  # <-- key change
            timeout=120,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Network error contacting Sora 2 / OpenAI: {e}",
        )

    if sora_resp.status_code >= 400:
        raise HTTPException(
            status_code=sora_resp.status_code,
            detail=f"Sora 2 API error: {sora_resp.text}",
        )

    ctype = sora_resp.headers.get("Content-Type", "").lower()

    uploads_dir = os.path.join("static", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    job_uid = uuid.uuid4().hex[:8]
    out_name = f"sora2_{user_id}_{job_uid}.mp4"
    out_disk_path = os.path.join(uploads_dir, out_name)

    # ---------- CASE A: response is JSON (job metadata or completion metadata)
    if "application/json" in ctype:
        try:
            payload = sora_resp.json()
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Sora 2 returned JSON but we couldn't parse it",
            )

        status = payload.get("status") or payload.get("state") or "unknown"

        # still rendering
        if status in ("queued", "processing", "running"):
            return {
                "ok": True,
                "status": status,
                "provider_job_id": payload.get("id") or payload.get("job_id"),
                "message": "Sora is rendering. Call /generate/video/status with job_id.",
                "raw": payload,
            }

        # completed but just metadata
        if status == "completed" or payload.get("status") == "completed":
            return {
                "ok": True,
                "status": "completed",
                "provider_job_id": payload.get("id") or payload.get("job_id"),
                "seconds": payload.get("seconds"),
                "size": payload.get("size"),
                "note": "Video metadata says completed, fetch actual bytes via /generate/video/status",
                "raw": payload,
            }

        # maybe it inlined the video as base64 or gave us a direct URL
        video_url = (
            payload.get("video_url")
            or payload.get("url")
            or payload.get("result_url")
        )
        video_b64 = payload.get("video_b64")

        if video_b64:
            import base64
            video_bytes = base64.b64decode(video_b64)
            if len(video_bytes) < 50000:
                raise HTTPException(
                    status_code=500,
                    detail="Sora returned suspiciously tiny base64 video"
                )
            with open(out_disk_path, "wb") as f:
                f.write(video_bytes)

        elif video_url:
            dl = requests.get(video_url, headers=headers, timeout=120)
            if dl.status_code >= 400:
                raise HTTPException(
                    status_code=500,
                    detail=f"Could not download Sora video_url: {dl.text}",
                )
            video_bytes = dl.content
            if len(video_bytes) < 50000:
                raise HTTPException(
                    status_code=500,
                    detail="Downloaded video too small; looks invalid.",
                )
            with open(out_disk_path, "wb") as f:
                f.write(video_bytes)
        else:
            # no bytes yet, tell caller to poll /generate/video/status
            return {
                "ok": True,
                "status": payload.get("status", "unknown"),
                "provider_job_id": payload.get("id") or payload.get("job_id"),
                "note": "No direct bytes yet. Poll /generate/video/status.",
                "raw": payload,
            }

        loop_path = f"static/uploads/{out_name}".replace("\\", "/")
        return {
            "ok": True,
            "status": "ready",
            "loop_path": loop_path,
            "note": "Generated via Sora 2 (JSON->bytes path)",
        }

    # ---------- CASE B: response is already binary mp4
    video_bytes = sora_resp.content
    if len(video_bytes) < 50000:
        raise HTTPException(
            status_code=500,
            detail="Sora returned tiny binary; not treating as valid video."
        )

    with open(out_disk_path, "wb") as f:
        f.write(video_bytes)

    loop_path = f"static/uploads/{out_name}".replace("\\", "/")
    return {
        "ok": True,
        "status": "ready",
        "loop_path": loop_path,
        "note": "Generated via Sora 2 (direct binary path)",
    }



# ----------------------------
# YOUTUBE ENDPOINTS
# ----------------------------

@app.get("/youtube/auth/url", tags=["YouTube"])
def youtube_auth_url(user=Depends(require_role(PUBLISHER_ROLES, require_verified=True))):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")

    if not client_id or not redirect_uri:
        raise HTTPException(status_code=500, detail="YouTube OAuth not configured")

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "access_type": "offline",    # we want a refresh_token
        "prompt": "consent",         # force Google to re-show consent and resend refresh_token
        "scope": YOUTUBE_SCOPES,
    }

    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"auth_url": url}

@app.get("/youtube/oauth2/callback", tags=["YouTube"])
def youtube_oauth2_callback(code: str, request: Request):
    # try to recover the user from cookie token instead of forcing Swagger-style Authorization header

    # 1. pull token from cookie so browser-based redirect can work
    token = request.cookies.get("token")
    if not token:
        # this means you weren't logged in in this browser session when you started auth_url
        raise HTTPException(status_code=401, detail="Missing login cookie for callback")

    # 2. decode token just like current_user does
    if token.startswith("Bearer "):
        token = token[len("Bearer "):]

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token during callback")

    uid_raw = payload.get("sub") or payload.get("id")
    if uid_raw is None:
        raise HTTPException(status_code=401, detail="Token missing user id")

    try:
        uid = int(uid_raw)
    except Exception:
        raise HTTPException(status_code=401, detail="Bad user id in token")

    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # --- below here, keep the rest of the logic the same as before ---
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

    r = requests.post(
        "https://oauth2.googleapis.com/token",
        data=data,
        timeout=30,
    )

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    token_payload = r.json()
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


@app.get("/youtube/channels/me", tags=["YouTube"])
def youtube_channels_me(
    user=Depends(require_role(PUBLISHER_ROLES, require_verified=True)),
):
    # 1. Get your encrypted refresh token from DB
    refresh_token = _get_youtube_refresh(user["id"])

    # 2. Exchange refresh_token -> access_token
    access_token = _youtube_get_access_token(refresh_token)

    # 3. Call YouTube Data API (authenticated)
    r = requests.get(
        "https://youtube.googleapis.com/youtube/v3/channels",
        params={"part": "snippet", "mine": "true"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )

    # Authenticated calls like videos.insert and channels.list require
    # Authorization: Bearer <access_token>.

    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    return r.json()

@app.post("/youtube/upload", tags=["YouTube"])
def youtube_upload_video(
    user=Depends(require_role(["admin", "owner"], require_verified=True)),
    video_file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    tags: str = Form(""),
    privacy_status: str = Form("unlisted"),
    publish_at: str = Form(""),
):
    """
    Upload a video file to the authorized user's YouTube channel.
    Returns the videoId on success.
    """

    # 1. Get user's refresh token and mint an access token
    refresh_token = _get_youtube_refresh(user["id"])
    access_token = _youtube_get_access_token(refresh_token)

    # 2. Read the file bytes (UploadFile is SpooledTemporaryFile, we just read it)
    try:
        video_bytes = video_file.file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {e}")

    if not video_bytes:
        raise HTTPException(status_code=400, detail="Empty video file")

    # 3. Build metadata YouTube expects
    # snippet: title, description, tags
    # status: privacyStatus
    snippet = {
        "title": title,
        "description": description,
    }
    parsed_tags = _parse_tags(tags)
    if parsed_tags:
        snippet["tags"] = parsed_tags

    desired_visibility = (privacy_status or "unlisted").strip().lower()
    allowed_visibilities = {"public", "unlisted", "private"}
    if desired_visibility not in allowed_visibilities:
        raise HTTPException(
            status_code=400,
            detail=f"privacy_status must be one of {', '.join(sorted(allowed_visibilities))}",
        )

    scheduled_iso = _normalize_publish_at(publish_at)
    if scheduled_iso and desired_visibility != "public":
        raise HTTPException(
            status_code=400,
            detail="Scheduled publish is only supported when visibility is set to 'public'.",
        )

    status_obj = {
        "privacyStatus": desired_visibility if not scheduled_iso else "private"
    }
    if scheduled_iso:
        status_obj["publishAt"] = scheduled_iso

    metadata_obj = {
        "snippet": snippet,
        "status": status_obj
    }

    metadata_json = json.dumps(metadata_obj)

    # 4. Build multipart/related body manually
    # We create a random boundary and send 2 parts:
    #   - metadata (application/json; charset=UTF-8)
    #   - media (video/*)
    boundary = "==============CREATOR_TOOLKIT_" + uuid.uuid4().hex

    # NOTE: We must use CRLF (\r\n) between MIME segments exactly how YouTube expects.
    # We'll assemble bytes manually.
    part1_headers = (
        f"--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata_json}\r\n"
    )

    part2_headers = (
        f"--{boundary}\r\n"
        f"Content-Type: {video_file.content_type or 'video/mp4'}\r\n\r\n"
    )

    closing = f"\r\n--{boundary}--\r\n"

    body_bytes = (
        part1_headers.encode("utf-8") +
        part2_headers.encode("utf-8") +
        video_bytes +
        closing.encode("utf-8")
    )

    # 5. Send request to YouTube Data API v3 videos.insert
    # We'll request the snippet+status parts so we can set title, desc, privacy.
    upload_url = (
        "https://www.googleapis.com/upload/youtube/v3/videos"
        "?part=snippet,status"
    )

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": f"multipart/related; boundary={boundary}",
    }

    r = requests.post(upload_url, headers=headers, data=body_bytes, timeout=90)

    # 6. Handle response
    if r.status_code >= 400:
        # YouTube gives useful JSON error details.
        raise HTTPException(status_code=r.status_code, detail=r.text)

    try:
        yt_resp = r.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Upload succeeded but could not parse JSON")

    # YouTube responds with an object containing 'id' which is the new videoId.
    video_id = yt_resp.get("id")
    return {
        "ok": True,
        "video_id": video_id,
        "requested_visibility": desired_visibility,
        "scheduled_publish_at": scheduled_iso,
        "youtube_response": yt_resp,
    }


# ----------------------------
# JOB QUEUE ENDPOINTS
# ----------------------------

WORKER = QueueWorker(
    handlers={
        "package": job_handle_package,
        "qa_batch": job_handle_qa_batch,
    },
    poll_interval=0.5,
)
WORKER.start()

class EnqueuePackageReq(BaseModel):
    loop_video_path: str
    audio_path: str
    fade_in_ms: int = 500
    fade_out_ms: int = 800
    out_path: str | None = None

@app.post("/package_async")
def package_async(
    req: EnqueuePackageReq,
    user=Depends(require_role(["admin", "owner", "editor"], require_verified=True)),
):
    """Enqueue a video packaging job for background processing."""

    # associate job with user in the future; for now just enqueue
    jid = enqueue("package", req.dict())
    return {"job_id": jid}

class EnqueueQABatchReq(BaseModel):
    paths: list
    palette: list = []
    thresholds: dict = {"loop": 0.92, "style": 75}

class PublishPipelineReq(BaseModel):
    # creative / branding
    title: str
    description: str
    tags: Optional[str] = ""  # comma-separated list

    # source assets
    loop_path: str            # e.g. "static/uploads/my_loop.mp4"
    song_path: str            # e.g. "static/uploads/my_song.mp3"
    duration_ms: int          # e.g. 180000 for ~3 mins

    # narration
    narration_text: Optional[str] = None
    narration_voice_id: Optional[str] = None

    # how to publish
    privacy_status: str = "unlisted"  # "public" | "unlisted" | "private"
    publish_at: Optional[str] = None


@app.post("/qa/batch_async")
def qa_batch_async(
    req: EnqueueQABatchReq,
    user=Depends(require_role(["admin", "owner", "editor"], require_verified=True)),
):
    jid = enqueue("qa_batch", req.dict())
    return {"job_id": jid}

@app.get("/jobs/{jid}")
def jobs_get(
    jid: str,
    user=Depends(require_role(["admin", "owner", "editor"], require_verified=True)),
):
    job = get_job(jid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize_job_detail(job)


@app.get("/jobs")
def jobs_list(
    user=Depends(require_role(["admin", "owner", "editor"], require_verified=True)),
):
    return {"jobs": [_serialize_job(job) for job in list_jobs(limit=25)]}


# ----------------------------
# CORE APP / UTILS
# ----------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/ui", StaticFiles(directory="ui", html=True), name="ui")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/upload")
def upload(file: UploadFile = File(...)):
    out_path = os.path.join("static", "uploads", file.filename)
    with open(out_path, "wb") as f:
        f.write(file.file.read())
    return {
        "path": out_path.replace("\\", "/"),
        "size": os.path.getsize(out_path)
    }

@app.get("/download")
def download(path: str):
    p = path.replace("..", "")
    if not os.path.exists(p):
        return JSONResponse(status_code=404, content={"error": "not found"})
    return FileResponse(p)


class CompileReq(BaseModel):
    scene_yaml_path: str

@app.post("/compile")
def compile_scene(req: CompileReq):
    path = req.scene_yaml_path.replace("..", "")
    prompt_stub = "lofi neon street, film grain, soft camera"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            prompt_stub = f.read().strip()[:200]
    return {
        "scene_yaml_path": path,
        "prompts": {
            "image": f"{prompt_stub} — stills",
            "veo3": f"{prompt_stub} — 8s loop",
        },
    }


def compute_loop_score(video_path: str) -> float:
    try:
        size = os.path.getsize(video_path)
    except Exception:
        size = 1
    h = int(hashlib.sha256(video_path.encode()).hexdigest(), 16) % 1000
    return round(
        min(
            0.99,
            0.65
            + (size % 100000) / 100000 * 0.3
            + (h / 1000) * 0.05,
        ),
        3,
    )

def compute_style_score(video_path: str, palette: list) -> int:
    base = (len(palette) * 13 + len(os.path.basename(video_path)) * 3) % 40 + 60
    return int(base)

def detect_watermark(video_path: str) -> bool:
    return "wm" in os.path.basename(video_path).lower()

@app.post("/qa")
def qa(loop_video_path: str = Form(...), palette: str = Form("[]")):
    try:
        pal = json.loads(palette)
    except Exception:
        pal = []
    return {
        "loop_score": compute_loop_score(loop_video_path),
        "style_score": compute_style_score(loop_video_path, pal),
        "watermark_flag": detect_watermark(loop_video_path),
    }

@app.post("/qa/batch")
def api_qa_batch(
    paths: list = Body(...),
    palette: list = Body(default=["#7359B6", "#1A1C2C", "#F2E9E4"]),
    thresholds: dict = Body(default={"loop": 0.92, "style": 75}),
):
    rows = []
    for p in paths:
        if not os.path.exists(p):
            rows.append({"path": p, "error": "not found"})
            continue
        loop_score = compute_loop_score(p)
        style_score = compute_style_score(p, palette)
        watermark_flag = detect_watermark(p)
        verdict = (
            "PASS"
            if (
                loop_score >= thresholds.get("loop", 0.92)
                and style_score >= thresholds.get("style", 75)
                and not watermark_flag
            )
            else "RETRY"
        )
        rows.append(
            {
                "path": p,
                "loop_score": loop_score,
                "style_score": style_score,
                "watermark": watermark_flag,
                "verdict": verdict,
            }
        )
    return {"results": rows}

@app.post("/qa/batch_csv")
def api_qa_batch_csv(
    paths: list = Body(...),
    palette: list = Body(default=["#7359B6", "#1A1C2C", "#F2E9E4"]),
    thresholds: dict = Body(default={"loop": 0.92, "style": 75}),
):
    os.makedirs(os.path.join("static", "reports"), exist_ok=True)
    csv_path = os.path.join(
        "static",
        "reports",
        f"qa_{str(uuid.uuid4())[:8]}.csv",
    )
    rows = api_qa_batch(paths, palette, thresholds)["results"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "path",
                "loop_score",
                "style_score",
                "watermark",
                "verdict",
                "error",
            ]
        )
        for r in rows:
            w.writerow(
                [
                    r.get("path", ""),
                    r.get("loop_score", ""),
                    r.get("style_score", ""),
                    r.get("watermark", ""),
                    r.get("verdict", ""),
                    r.get("error", ""),
                ]
            )
    return {"csv_path": csv_path, "count": len(rows)}

class PackageReq(BaseModel):
    loop_video_path: str
    audio_path: str
    fade_in_ms: int = 500
    fade_out_ms: int = 800
    out_path: str | None = None

class PackageReqV2(BaseModel):
    loop_path: str
    song_path: str
    out_name: str
    duration_ms: int
    voiceover_path: Optional[str] = None

@app.post("/package")
def package(req: PackageReq):
    out_path = req.out_path or os.path.join("static", "uploads", "master.mp4")
    audio_ms = probe_audio_duration(req.audio_path)
    if audio_ms <= 0:
        raise HTTPException(status_code=400, detail="Invalid audio file (duration <= 0)")

    try:
        res = build_master_from_loop(
            loop_clip_path=req.loop_video_path,
            music_audio_path=req.audio_path,
            out_path=out_path,
            target_ms=audio_ms,
            voiceover_audio_path=None,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"packager failed: {exc}")

    return {
        "master_path": out_path,
        "audio_ms": audio_ms,
        "detail": res,
    }

@app.post("/package/master", tags=["Packager"])
def package_master(
    req: PackageReqV2,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Build final mastered MP4:
    - loops req.loop_path until >= duration_ms
    - strips baked audio
    - mixes song_path (+ voiceover_path if provided)
    - muxes audio into video
    - writes to static/masters/{out_name}.mp4
    """

    masters_dir = os.path.join("static", "masters")
    os.makedirs(masters_dir, exist_ok=True)

    out_file = req.out_name if req.out_name.lower().endswith(".mp4") else req.out_name + ".mp4"
    out_path = os.path.join(masters_dir, out_file)

    try:
        result = build_master_from_loop(
            loop_clip_path=req.loop_path,
            music_audio_path=req.song_path,
            out_path=out_path,
            target_ms=req.duration_ms,
            voiceover_audio_path=req.voiceover_path,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"packager failed: {e}")

    public_url = f"/static/masters/{out_file}"

    return {
        "ok": True,
        "public_url": public_url,
        "disk_path": out_path,
        "approx_duration_ms": result.get("approx_duration_ms"),
        "voiceover_used": result.get("voiceover_used"),
    }

@app.get("/projects")
def api_list_projects():
    return {"projects": list_projects()}

@app.post("/projects")
def api_create_or_update_project(payload: dict = Body(...)):
    proj = {
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
    if not proj["id"]:
        return JSONResponse(
            status_code=400,
            content={"error": "id required"},
        )
    return upsert_project(proj)

@app.get("/projects/{pid}")
def api_get_project(pid: str):
    p = get_project(pid)
    if not p:
        return JSONResponse(status_code=404, content={"error": "not found"})
    return p

@app.delete("/projects/{pid}")
def api_delete_project(pid: str):
    return {"deleted": delete_project(pid)}

@app.get("/presets")
def api_list_presets():
    return {"presets": list_presets()}

@app.post("/presets")
def api_upsert_preset(payload: dict = Body(...)):
    pr = {
        "id": payload.get("id"),
        "scene_yaml": payload.get("scene_yaml"),
        "title": payload.get("title", ""),
    }
    if not pr["id"] or not pr["scene_yaml"]:
        return JSONResponse(
            status_code=400,
            content={"error": "id and scene_yaml required"},
        )
    return upsert_preset(pr)

@app.delete("/presets/{pid}")
def api_delete_preset(pid: str):
    return {"deleted": delete_preset(pid)}


# ----------------------------
# AUTH / PROFILE ROUTES
# ----------------------------

class RegisterReq(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdateReq(BaseModel):
    full_name: str
    email: EmailStr

class PasswordChangeReq(BaseModel):
    current_password: str
    new_password: str

class KeyUpsertReq(BaseModel):
    provider: str
    secret: str

class VerifyEmailReq(BaseModel):
    code: str

class RoleUpdateReq(BaseModel):
    role: str
    user_id: Optional[int] = None


class SMTPConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    use_tls: Optional[bool] = True
    username: Optional[str] = None
    password: Optional[str] = None
    from_address: Optional[str] = None


class SMTPTestRequest(BaseModel):
    to: EmailStr
    subject: Optional[str] = "Creator Toolkit SMTP Test"
    body: Optional[str] = "This is a test email from Creator Toolkit."

@app.post("/auth/register")
def auth_register(req: RegisterReq):
    if get_user_by_email(req.email):
        return JSONResponse(
            status_code=400,
            content={"error": "Email already registered"},
        )
    verification_code = _generate_verification_code()
    user_id = create_user(
        req.email,
        req.full_name,
        hash_password(req.password),
        verification_code=verification_code,
    )
    email_sent = _send_verification_email(req.email, verification_code, req.full_name)
    logger.info("Registered new user_id=%s email=%s", user_id, req.email)
    message = "Account created. Check your email for the verification code."
    if not email_sent:
        message += " Email delivery is not configured; contact your administrator for assistance."
    return {
        "ok": True,
        "user_id": user_id,
        "requires_verification": True,
        "message": message,
        "email_sent": email_sent,
    }

@app.post("/auth/login")
def auth_login(req: LoginReq):
    u = get_user_by_email(req.email)
    if not u or not verify_password(req.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = int(u["id"])
    email = u["email"]

    # store sub as a string, not an int
    token = create_access_token(user_id, email)

    resp = JSONResponse(
        {
            "token": token,
            "user": _user_payload(u),
            "requires_verification": not bool(u.get("is_verified")),
            "must_change_password": bool(u.get("must_change_password")),
        }
    )
    resp.set_cookie(
        "token",
        token,
        httponly=True,
        samesite="Lax",
        secure=False,  # set True when HTTPS
    )
    logger.info("/auth/login issued token for user_id=%s", user_id)
    return resp


@app.post("/auth/verify-email")
def auth_verify_email(req: VerifyEmailReq, user=Depends(current_user)):
    if user.get("is_verified"):
        return {"ok": True, "already_verified": True, "user": _user_payload(user)}

    stored_code = user.get("verification_code")
    if not stored_code:
        return JSONResponse(
            status_code=400,
            content={"error": "No verification code found. Request a new one."},
        )

    if req.code.strip().upper() != str(stored_code).strip().upper():
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid verification code"},
        )

    mark_email_verified(user["id"])
    refreshed = get_user_by_id(user["id"]) or user
    logger.info("User %s verified their email", user["id"])
    return {"ok": True, "user": _user_payload(refreshed), "message": "Email verified."}


@app.post("/auth/resend-verification")
def auth_resend_verification(user=Depends(current_user)):
    if user.get("is_verified"):
        return {"ok": True, "already_verified": True, "user": _user_payload(user)}

    new_code = _generate_verification_code()
    set_verification_code(user["id"], new_code)
    refreshed = get_user_by_id(user["id"]) or user
    email_sent = _send_verification_email(user.get("email"), new_code, refreshed.get("full_name"))
    logger.info("Issued new verification code for user_id=%s", user["id"])
    message = "A new verification code has been emailed to you."
    if not email_sent:
        message = "Verification code regenerated, but email delivery is not configured."
    return {
        "ok": True,
        "user": _user_payload(refreshed),
        "message": message,
        "email_sent": email_sent,
    }


@app.post("/auth/logout")
def auth_logout(response: Response):
    # clear cookie
    response = JSONResponse({"ok": True})
    response.delete_cookie("token")
    return response

@app.get("/auth/whoami")
def whoami(user=Depends(current_user)):
    info = _user_payload(user)
    info["created_at"] = user.get("created_at")
    info["verified_at"] = user.get("verified_at")
    return info

@app.get("/me")
def me(user=Depends(current_user)):
    info = _user_payload(user)
    info["created_at"] = user.get("created_at")
    info["verified_at"] = user.get("verified_at")
    return info

@app.post("/profile")
def profile_update(req: ProfileUpdateReq, user=Depends(current_user)):
    existing = get_user_by_email(req.email)
    if existing and existing["id"] != user["id"]:
        return JSONResponse(
            status_code=400,
            content={"error": "Email already in use"},
        )
    normalized_email = req.email.lower().strip()
    email_changed = normalized_email != (user.get("email") or "").lower()
    update_user_profile(user["id"], req.full_name, req.email)
    verification_code = None
    email_sent = False
    if email_changed:
        verification_code = _generate_verification_code()
        set_verification_code(user["id"], verification_code)
        email_sent = _send_verification_email(normalized_email, verification_code, req.full_name)
        logger.info("User %s updated email; verification reset", user["id"])
    refreshed = get_user_by_id(user["id"]) or user
    response = {"ok": True, "user": _user_payload(refreshed)}
    if verification_code:
        response["requires_verification"] = True
        response["message"] = "Email updated. Check your inbox for a new verification code." if email_sent else "Email updated. Verification code regenerated but email delivery is not configured."
        response["email_sent"] = email_sent
    return response

@app.post("/profile/password")
def profile_password_change(req: PasswordChangeReq, user=Depends(current_user)):
    # user here includes password_hash (from DB via current_user)
    if not verify_password(req.current_password, user["password_hash"]):
        return JSONResponse(
            status_code=400,
            content={"error": "Current password incorrect"},
        )
    update_password_hash(
        user["id"],
        hash_password(req.new_password),
        must_change_password=False,
    )
    set_must_change_password(user["id"], False)
    refreshed = get_user_by_id(user["id"]) or user
    return {"ok": True, "user": _user_payload(refreshed)}

@app.post("/profile/role")
def profile_role_update(
    req: RoleUpdateReq,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    desired = (req.role or "").strip().lower()
    valid_roles = {"admin", "owner", "editor", "viewer"}
    if desired not in valid_roles:
        return JSONResponse(
            status_code=400,
            content={"error": "role must be one of admin, owner, editor, viewer"},
        )

    target_id = req.user_id or user["id"]
    update_role(target_id, desired)
    refreshed = get_user_by_id(target_id)
    if not refreshed:
        raise HTTPException(status_code=404, detail="Target user not found")
    logger.info(
        "User %s updated role for user_id=%s to %s",
        user["id"],
        target_id,
        desired,
    )
    return {"ok": True, "user": _user_payload(refreshed)}


@app.post("/profile/access-group")
def profile_access_group_deprecated():
    raise HTTPException(status_code=410, detail="Deprecated: use /profile/role")


@admin_router.get("/smtp")
def admin_get_smtp_settings(
    user=Depends(require_role(["admin"], require_verified=True)),
):
    return get_public_smtp_settings()


@admin_router.post("/smtp")
def admin_update_smtp_settings(
    config: SMTPConfigUpdate,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    payload = config.dict(exclude_unset=True)
    payload = {k: v for k, v in payload.items() if v is not None}
    try:
        update_smtp_settings(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    refreshed = get_public_smtp_settings()
    return {"ok": True, "settings": refreshed}


@admin_router.post("/smtp/test")
def admin_test_smtp(
    req: SMTPTestRequest,
    user=Depends(require_role(["admin"], require_verified=True)),
):
    settings = resolve_smtp_settings()
    host = settings.get("host")
    from_address = settings.get("from_address") or settings.get("username")
    if not host or not from_address:
        raise HTTPException(status_code=400, detail="SMTP configuration incomplete")

    msg = EmailMessage()
    msg["Subject"] = req.subject or "Creator Toolkit SMTP Test"
    msg["From"] = from_address
    msg["To"] = req.to
    msg.set_content(req.body or "This is a test email from Creator Toolkit.")

    try:
        with smtplib.SMTP(host, int(settings.get("port") or 0), timeout=SMTP_TIMEOUT) as smtp:
            if bool(settings.get("use_tls", True)):
                try:
                    smtp.starttls()
                except smtplib.SMTPException:
                    logger.debug("SMTP server did not accept STARTTLS during test send")
            username = settings.get("username")
            password = settings.get("password")
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP send failed: {exc}") from exc

    return {"ok": True}

@app.get("/profile/keys")
def profile_keys_list(user=Depends(require_role(["admin", "owner"], require_verified=True))):
    raw = list_user_keys(user["id"])
    # we do NOT return the decrypted secrets, just providers
    return {"providers": list(raw.keys())}

@app.post("/profile/keys")
def profile_keys_upsert(
    req: KeyUpsertReq,
    user=Depends(require_role(["admin", "owner"], require_verified=True)),
):
    cipher = encrypt_value(req.secret)
    upsert_user_key(user["id"], req.provider.lower(), cipher)
    return {"ok": True}

@app.delete("/profile/keys/{provider}")
def profile_keys_delete(
    provider: str,
    user=Depends(require_role(["admin", "owner"], require_verified=True)),
):
    delete_user_key(user["id"], provider.lower())
    return {"ok": True, "deleted": provider.lower()}

@app.post("/pipeline/publish_lofi", tags=["Pipeline"])
def pipeline_publish_lofi(
    req: PublishPipelineReq,
    user=Depends(require_role(PUBLISHER_ROLES, require_verified=True)),
):
    """
    One-shot pipeline:
    1. (optional) generate narration via ElevenLabs
    2. render master video (loop + music + narration)
    3. upload to YouTube
    4. return all metadata
    """

    user_id = user["id"]

    # 1. If narration_text is provided, generate voiceover MP3
    voiceover_path = None
    if req.narration_text and req.narration_text.strip():
        if not req.narration_voice_id:
            raise HTTPException(status_code=400, detail="narration_voice_id is required if narration_text is provided")
        voiceover_path = _generate_voiceover_mp3_for_user(
            user_id=user_id,
            text=req.narration_text.strip(),
            voice_id=req.narration_voice_id.strip(),
            model_id=None,  # could expose in request later
        )

    # 2. Build the master video locally
    masters_dir = os.path.join("static", "masters")
    os.makedirs(masters_dir, exist_ok=True)

    out_file = req.title.strip().replace(" ", "_")
    if not out_file:
        out_file = "autopublish"
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"packager failed: {e}")

    public_url = f"/static/masters/{out_file}"

    # 3. Upload that master to YouTube
    yt_info = _youtube_upload_from_disk(
        user_id=user_id,
        file_path=out_path,
        title=req.title,
        description=req.description,
        tags=req.tags or "",
        privacy_status=req.privacy_status,
        publish_at=req.publish_at,
    )

    # 4. return final summary
    return {
        "ok": True,
        "master_public_url": public_url,
        "master_disk_path": out_path,
        "approx_duration_ms": result.get("approx_duration_ms"),
        "voiceover_used": result.get("voiceover_used"),
        "youtube_video_id": yt_info["video_id"],
        "youtube_raw": yt_info["youtube_response"],
        "youtube_requested_visibility": yt_info["requested_visibility"],
        "youtube_scheduled_publish_at": yt_info["scheduled_publish_at"],
    }

@app.get("/generate/video/status", tags=["Generate"])
def get_video_status(
    job_id: str,
    user=Depends(require_role(CREATOR_ROLES, require_verified=True)),
):
    """
    Check status of a Sora 2 video job by its ID returned from /generate/video.
    If finished, attempt to download the binary and save it locally.
    """
    user_id = user["id"]
    openai_key = _get_openai_key_for_user(user_id)

    headers = {
        "Authorization": f"Bearer {openai_key}",
    }

    # 1. Ask OpenAI for the metadata of this video job
    meta_resp = requests.get(
        f"https://api.openai.com/v1/videos/{job_id}",
        headers=headers,
        timeout=60,
    )

    if meta_resp.status_code >= 400:
        raise HTTPException(
            status_code=meta_resp.status_code,
            detail=f"Failed to get status: {meta_resp.text}"
        )

    try:
        meta = meta_resp.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Status response was not JSON")

    status = meta.get("status", "unknown")

    # Still rendering?
    if status in ("queued", "processing", "running"):
        return {
            "ok": True,
            "status": status,
            "job_id": job_id,
            "progress": meta.get("progress"),
            "seconds": meta.get("seconds"),
            "size": meta.get("size"),
        }

    # Failed?
    if status == "failed":
        raise HTTPException(
            status_code=500,
            detail=meta.get("error", "Generation failed")
        )

    # Completed. Now we actually need the bytes.
    if status == "completed":
        # Two possible patterns:
        # Pattern A: there's a direct video_url/asset in meta (check first)
        video_url = (
            meta.get("video_url")
            or meta.get("result_url")
            or meta.get("url")
        )

        uploads_dir = os.path.join("static", "uploads")
        os.makedirs(uploads_dir, exist_ok=True)

        out_name = f"sora2_{user_id}_{job_id}.mp4"
        out_disk_path = os.path.join(uploads_dir, out_name)

        if video_url:
            # If meta already includes a downloadable URL, fetch it:
            dl = requests.get(video_url, headers=headers, timeout=120)
            if dl.status_code >= 400:
                raise HTTPException(
                    status_code=500,
                    detail=f"Download via video_url failed: {dl.text}"
                )
            with open(out_disk_path, "wb") as f:
                f.write(dl.content)

        else:
            # Pattern B: binary lives at /videos/{id}/content
            bin_resp = requests.get(
                f"https://api.openai.com/v1/videos/{job_id}/content",
                headers=headers,
                timeout=120,
            )

            if bin_resp.status_code >= 400:
                raise HTTPException(
                    status_code=500,
                    detail=f"Download via /content failed: {bin_resp.text}"
                )

            # sanity check: verify it's not JSON (aka still not an error)
            ctype = bin_resp.headers.get("Content-Type", "").lower()
            if "application/json" in ctype:
                # still not getting binary, so return the meta so you can inspect it easily
                return {
                    "ok": False,
                    "status": "completed",
                    "job_id": job_id,
                    "note": "Video metadata ready but binary not returned. Inspect meta.",
                    "meta": meta,
                    "raw": bin_resp.text,
                }

            with open(out_disk_path, "wb") as f:
                f.write(bin_resp.content)

        return {
            "ok": True,
            "status": "ready",
            "loop_path": f"static/uploads/{out_name}".replace("\\", "/"),
            "seconds": meta.get("seconds"),
            "size": meta.get("size"),
        }

    # Fallback: unexpected status
    return {
        "ok": False,
        "status": status,
        "meta": meta,
    }


app.include_router(admin_router)
