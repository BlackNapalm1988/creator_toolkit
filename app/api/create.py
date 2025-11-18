"""Content creation and generation routes."""

from __future__ import annotations

import datetime
import json
import math
import os
import uuid
from typing import Annotated, Optional

import requests
from fastapi import APIRouter, Depends, Form, HTTPException

from app.core.constants import CREATOR_ROLES
from app.core.settings import get_settings
from app.deps import require_role
from app.models.create import (
    ElevenGenerateForm,
    MusicGenReq,
    VideoGenReq,
)
from app.services.assets import add_asset
from app.services.keys import get_eleven_key_for_user, get_openai_key_for_user
from modules import jobs as jobs_module

router = APIRouter(tags=["Generate"])

STYLE_PRESETS = {
    "none": "",
    "lofi": "in Japanese urban lo-fi anime style, soft neon lighting, grainy film texture",
    "cinematic": "cinematic film look, shallow depth of field, anamorphic bokeh",
    "anime": "stylized anime look, clean lines, saturated palettes, expressive lighting",
    "painterly": "painterly illustration with visible brush strokes and soft edges",
    "hyperreal": "hyperrealistic, photoreal textures, precise lighting and reflections",
}

CAMERA_PRESETS = {
    "auto": "",
    "static": "with a static camera shot, no movement",
    "dolly_in": "with a slow dolly-in camera move",
    "dolly_out": "with a slow dolly-out camera move",
    "pan_left": "panning slowly to the left",
    "pan_right": "panning slowly to the right",
    "orbit": "orbiting slowly around the subject",
    "handheld": "handheld, natural micro jitters, grounded feel",
}


def parse_eleven_generate_form(
    text: Annotated[str, Form(...)],
    voice_id: Annotated[Optional[str], Form()] = None,
    # Avoid pydantic protected namespace warning ("model_" prefix)
    video_model_id: Annotated[Optional[str], Form(alias="model_id")] = None,
) -> ElevenGenerateForm:
    """Return a validated payload for ElevenLabs TTS generation form data."""

    return ElevenGenerateForm(
        text=text,
        voice_id=voice_id,
        model_id=video_model_id,
    )


@router.get("/elevenlabs/voices", tags=["ElevenLabs"])
def eleven_list_voices(
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """
    Return a clean list of voices the user can pick from.
    """

    api_key = get_eleven_key_for_user(user["id"])

    headers = {
        "xi-api-key": api_key,
        "Accept": "application/json",
    }

    url = "https://api.elevenlabs.io/v1/voices"

    try:
        resp = requests.get(url, headers=headers, timeout=30)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Network error contacting ElevenLabs: {exc}"
        ) from exc

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    voices_raw = data.get("voices") or []

    simplified = []
    for voice in voices_raw:
        vid = voice.get("voice_id")
        name = voice.get("name")
        if vid and name:
            simplified.append({"voice_id": vid, "name": name})

    if not simplified:
        return {
            "ok": True,
            "voices": [],
            "note": "No direct voices returned; showing raw API response for debugging.",
            "raw": data,
        }

    return {"ok": True, "count": len(simplified), "voices": simplified}


@router.post("/elevenlabs/generate", tags=["ElevenLabs"])
def eleven_generate_tts(
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
    form_data: Annotated[ElevenGenerateForm, Depends(parse_eleven_generate_form)],
):
    """
    Generate speech audio from ElevenLabs for the given text.
    Saves an MP3 file under static/tts and returns info about it.
    """

    api_key = get_eleven_key_for_user(user["id"])

    text = form_data.text
    voice_id = form_data.voice_id
    model_id = form_data.model_id

    if not voice_id:
        headers_tmp = {"xi-api-key": api_key, "Accept": "application/json"}
        voices_resp = requests.get(
            "https://api.elevenlabs.io/v1/voices",
            headers=headers_tmp,
            timeout=30,
        )
        if voices_resp.status_code < 400:
            voices_json = voices_resp.json()
            voices_list = voices_json.get("voices") or []
            if voices_list:
                voice_id = voices_list[0].get("voice_id")

    if not voice_id:
        raise HTTPException(
            status_code=400,
            detail="No voice_id provided and no default voice could be determined. Call /elevenlabs/voices to inspect.",
        )

    settings = get_settings()
    out_dir = os.path.join(settings.USER_CONTENT_DIR, "tts")
    os.makedirs(out_dir, exist_ok=True)

    out_name = f"{user['id']}_{uuid.uuid4().hex}.mp3"
    out_path = os.path.join(out_dir, out_name)

    payload = {"text": text}
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
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Network error contacting ElevenLabs TTS: {exc}",
        ) from exc

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    audio_bytes = resp.content
    if not audio_bytes or len(audio_bytes) < 10:
        raise HTTPException(status_code=500, detail="ElevenLabs returned empty audio")

    try:
        with open(out_path, "wb") as f:
            f.write(audio_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not save MP3: {exc}"
        ) from exc

    public_url = f"/content/tts/{out_name}"

    return {
        "ok": True,
        "file_name": out_name,
        "file_url": public_url,
        "bytes": len(audio_bytes),
        "voice_id_used": voice_id,
        "model_id_used": model_id,
        "text_preview": text[:120],
    }


@router.post("/generate/music")
def generate_music(
    req: MusicGenReq,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """
    Kick off ElevenLabs music generation.
    Returns either ready track info or a job_id to poll.
    """

    user_id = user["id"]
    xi_key = get_eleven_key_for_user(user_id)

    music_payload = {
        "prompt": req.prompt,
        "duration_seconds": req.duration_seconds,
        "mood": req.mood,
        "genre": req.genre,
    }
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
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Network error contacting ElevenLabs Music: {exc}",
        ) from exc

    if el_resp.status_code >= 400:
        raise HTTPException(
            status_code=el_resp.status_code,
            detail=f"ElevenLabs music API error: {el_resp.text}",
        )

    ctype = el_resp.headers.get("Content-Type", "").lower()

    settings = get_settings()
    music_dir = os.path.join(settings.USER_CONTENT_DIR, "music")
    os.makedirs(music_dir, exist_ok=True)

    if "application/json" in ctype:
        try:
            payload = el_resp.json()
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail="ElevenLabs returned JSON but we couldn't parse it",
            ) from exc

        status = payload.get("status", "unknown")

        if status in ("queued", "processing", "running", "generating"):
            return {
                "ok": True,
                "status": status,
                "provider_job_id": payload.get("id") or payload.get("job_id"),
                "message": "Music is generating. Poll /generate/music/status with job_id.",
                "raw": payload,
            }

        audio_url = (
            payload.get("audio_url")
            or payload.get("music_url")
            or payload.get("url")
            or payload.get("result_url")
        )
        audio_b64 = payload.get("audio_b64") or payload.get("music_b64")

        ts_tag = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
        out_name = f"track_{user_id}_{ts_tag}.mp3"
        out_disk_path = os.path.join(music_dir, out_name)

        if audio_b64:
            import base64

            audio_bytes = base64.b64decode(audio_b64)
            if len(audio_bytes) < 20000:
                raise HTTPException(
                    status_code=500,
                    detail="Music base64 too small; not treating as valid audio",
                )
            with open(out_disk_path, "wb") as f:
                f.write(audio_bytes)

            song_path = f"content/music/{out_name}".replace("\\", "/")
            try:
                add_asset(
                    user_id=user_id,
                    asset_type="audio",
                    path=song_path,
                    title=req.prompt[:80] if req.prompt else "",
                    metadata={"mood": req.mood, "genre": req.genre},
                )
            except Exception:
                pass

            return {
                "ok": True,
                "status": "ready",
                "song_path": song_path,
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

            song_path = f"content/music/{out_name}".replace("\\", "/")
            try:
                add_asset(
                    user_id=user_id,
                    asset_type="audio",
                    path=song_path,
                    title=req.prompt[:80] if req.prompt else "",
                    metadata={"mood": req.mood, "genre": req.genre},
                )
            except Exception:
                pass

            return {
                "ok": True,
                "status": "ready",
                "song_path": song_path,
                "note": "Generated via ElevenLabs (JSON->url path)",
            }

        return {
            "ok": True,
            "status": status,
            "provider_job_id": payload.get("id") or payload.get("job_id"),
            "note": "No audio bytes yet. Poll /generate/music/status.",
            "raw": payload,
        }

    audio_bytes = el_resp.content
    if len(audio_bytes) < 20000:
        raise HTTPException(
            status_code=500, detail="Direct audio too small; likely invalid"
        )

    ts_tag = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    out_name = f"track_{user_id}_{ts_tag}.mp3"
    out_disk_path = os.path.join(music_dir, out_name)

    with open(out_disk_path, "wb") as f:
        f.write(audio_bytes)

    song_path = f"content/music/{out_name}".replace("\\", "/")
    try:
        add_asset(
            user_id=user_id,
            asset_type="audio",
            path=song_path,
            title=req.prompt[:80] if req.prompt else "",
            metadata={"mood": req.mood, "genre": req.genre},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "status": "ready",
        "song_path": song_path,
        "note": "Generated via ElevenLabs (direct binary path)",
    }


@router.get("/generate/music/status")
def get_music_status(
    job_id: str,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """
    Poll ElevenLabs about a music generation job.
    If finished, download the audio and save it.
    """

    user_id = user["id"]
    xi_key = get_eleven_key_for_user(user_id)

    headers = {"xi-api-key": xi_key}

    poll_urls = [
        f"https://api.elevenlabs.io/v1/music/{job_id}",
        f"https://api.elevenlabs.io/v1/music/tasks/{job_id}",
    ]

    last_resp = None
    for url in poll_urls:
        resp = requests.get(url, headers=headers, timeout=60)
        last_resp = resp
        if resp.status_code < 400:
            break
    if last_resp is None or last_resp.status_code >= 400:
        raise HTTPException(
            status_code=last_resp.status_code if last_resp else 500,
            detail=f"Failed to poll ElevenLabs music status: {last_resp.text if last_resp else 'no response'}",
        )

    try:
        payload = last_resp.json()
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Music status response was not JSON"
        ) from exc

    status = payload.get("status", "unknown")

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

    if status in ("completed", "succeeded", "ready"):
        settings = get_settings()
        music_dir = os.path.join(settings.USER_CONTENT_DIR, "music")
        os.makedirs(music_dir, exist_ok=True)

        ts_tag = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
        out_name = f"track_{user_id}_{ts_tag}.mp3"
        out_disk_path = os.path.join(music_dir, out_name)

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

            song_path = f"content/music/{out_name}".replace("\\", "/")
            prompt_text = (payload.get("prompt") or "").strip()
            mood = payload.get("mood")
            genre = payload.get("genre")
            try:
                add_asset(
                    user_id=user_id,
                    asset_type="audio",
                    path=song_path,
                    title=prompt_text[:80],
                    metadata={"mood": mood, "genre": genre},
                )
            except Exception:
                pass
            return {
                "ok": True,
                "status": "ready",
                "song_path": song_path,
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

            song_path = f"content/music/{out_name}".replace("\\", "/")
            prompt_text = (payload.get("prompt") or "").strip()
            mood = payload.get("mood")
            genre = payload.get("genre")
            try:
                add_asset(
                    user_id=user_id,
                    asset_type="audio",
                    path=song_path,
                    title=prompt_text[:80],
                    metadata={"mood": mood, "genre": genre},
                )
            except Exception:
                pass
            return {
                "ok": True,
                "status": "ready",
                "song_path": song_path,
            }

        return {
            "ok": False,
            "status": status,
            "note": "Job finished but no audio asset fields found",
            "raw": payload,
        }

    return {
        "ok": False,
        "status": status,
        "raw": payload,
    }


@router.post("/generate/video")
def generate_video(
    req: VideoGenReq,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """
    Ask Sora 2 for a clip and (if possible) request a custom duration + aspect.
    Falls back to polling /generate/video/status if we only get metadata back.
    """

    user_id = user["id"]
    openai_key = get_openai_key_for_user(user_id)

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
        aspect_for_prompt = (
            f"{width // gcd}:{height // gcd}" if gcd else f"{width}:{height}"
        )

    prompt_bits = [req.prompt.strip()]

    if req.loop_hint:
        prompt_bits.append(
            "Make this a seamless looping clip with no visible jump between the end frame and the first frame."
        )

    if req.video_type and req.video_type.lower() == "short":
        prompt_bits.append(
            "Format as a vertical short-form video, ideal for TikTok/Reels/Shorts, under 60 seconds."
        )

    style_text = STYLE_PRESETS.get((req.style_preset or "none").lower(), "")
    if style_text:
        prompt_bits.append(style_text)

    camera_text = CAMERA_PRESETS.get((req.camera_motion or "auto").lower(), "")
    if camera_text:
        prompt_bits.append(camera_text)

    prompt_bits.append(
        f"Cinematic motion, stable composition. Aspect ratio {aspect_for_prompt}. Soft camera movement, no hard cuts."
    )

    final_prompt = " ".join(prompt_bits)

    # Enqueue a background job record so video generation appears in the Jobs API.
    job_payload = {
        "user_id": user_id,
        "prompt": final_prompt,
        "duration_seconds": req.duration_seconds,
        "size": normalized_size,
        "loop_hint": bool(req.loop_hint),
        "video_type": req.video_type or "standard",
        "style_preset": req.style_preset,
        "camera_motion": req.camera_motion,
        "seed": req.seed,
    }
    job_id = jobs_module.enqueue("sora_video", job_payload)

    multipart_fields = {
        "model": (None, "sora-2"),
        "prompt": (None, final_prompt),
        "seconds": (None, str(req.duration_seconds)),
        "size": (None, normalized_size),
    }

    headers = {
        "Authorization": f"Bearer {openai_key}",
    }

    try:
        sora_resp = requests.post(
            "https://api.openai.com/v1/videos",
            headers=headers,
            files=multipart_fields,
            timeout=120,
        )
    except Exception as exc:
        jobs_module.set_error(
            job_id, f"Network error contacting OpenAI videos endpoint: {exc}"
        )
        raise HTTPException(
            status_code=500,
            detail=f"Network error contacting OpenAI videos endpoint: {exc}",
        ) from exc

    if sora_resp.status_code >= 400:
        jobs_module.set_error(
            job_id,
            f"Sora error {sora_resp.status_code}: {sora_resp.text}",
            progress=None,
        )
        raise HTTPException(status_code=sora_resp.status_code, detail=sora_resp.text)

    ctype = sora_resp.headers.get("Content-Type", "").lower()

    uploads_dir = os.path.join("static", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    job_uid = uuid.uuid4().hex[:8]
    out_name = f"sora2_{user_id}_{job_uid}.mp4"
    out_disk_path = os.path.join(uploads_dir, out_name)

    if "application/json" in ctype:
        try:
            payload = sora_resp.json()
        except Exception as exc:
            jobs_module.set_error(
                job_id, "Sora 2 returned JSON but we couldn't parse it"
            )
            raise HTTPException(
                status_code=500,
                detail="Sora 2 returned JSON but we couldn't parse it",
            ) from exc

        status = payload.get("status") or payload.get("state") or "unknown"
        provider_job_id = payload.get("id") or payload.get("job_id")

        if status in ("queued", "processing", "running"):
            jobs_module.update_job_status(
                job_id,
                stage=status,
                status="running",
                progress=payload.get("progress"),
            )
            return {
                "ok": True,
                "status": status,
                "job_id": job_id,
                "provider_job_id": provider_job_id,
                "message": "Sora is rendering. Call /generate/video/status with job_id.",
                "raw": payload,
            }

        if status == "completed" or payload.get("status") == "completed":
            jobs_module.update_job_status(
                job_id,
                stage="completed_metadata",
                status="running",
                progress=payload.get("progress") or 90,
            )
            return {
                "ok": True,
                "status": "completed",
                "job_id": job_id,
                "provider_job_id": provider_job_id,
                "seconds": payload.get("seconds"),
                "size": payload.get("size"),
                "note": "Video metadata says completed, fetch actual bytes via /generate/video/status",
                "raw": payload,
            }

        video_url = (
            payload.get("video_url") or payload.get("url") or payload.get("result_url")
        )
        video_b64 = payload.get("video_b64")

        if video_b64:
            import base64

            video_bytes = base64.b64decode(video_b64)
            if len(video_bytes) < 50000:
                raise HTTPException(
                    status_code=500,
                    detail="Sora returned suspiciously tiny base64 video",
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
            jobs_module.update_job_status(
                job_id,
                stage=payload.get("status", "unknown"),
                status="running",
                progress=payload.get("progress"),
            )
            return {
                "ok": True,
                "status": payload.get("status", "unknown"),
                "job_id": job_id,
                "provider_job_id": provider_job_id,
                "note": "No direct bytes yet. Poll /generate/video/status.",
                "raw": payload,
            }

        loop_path = f"content/uploads/{out_name}".replace("\\", "/")
        try:
            add_asset(
                user_id=user_id,
                asset_type="video",
                path=loop_path,
                title=req.prompt[:80] if req.prompt else "",
                metadata={
                    "size": normalized_size,
                    "loop": bool(req.loop_hint),
                    "video_type": req.video_type or "standard",
                    "style_preset": req.style_preset,
                    "camera_motion": req.camera_motion,
                    "seed": req.seed,
                },
            )
        except Exception:
            pass
        jobs_module.set_result(
            job_id,
            {
                "out_path": loop_path,
                "provider": "sora-2",
                "seconds": payload.get("seconds"),
                "size": payload.get("size"),
            },
        )
        return {
            "ok": True,
            "status": "ready",
            "job_id": job_id,
            "loop_path": loop_path,
            "note": "Generated via Sora 2 (JSON->bytes path)",
        }

    video_bytes = sora_resp.content
    if len(video_bytes) < 50000:
        raise HTTPException(
            status_code=500,
            detail="Sora returned tiny binary; not treating as valid video.",
        )

    with open(out_disk_path, "wb") as f:
        f.write(video_bytes)

    loop_path = f"content/uploads/{out_name}".replace("\\", "/")
    try:
        add_asset(
            user_id=user_id,
            asset_type="video",
            path=loop_path,
            title=req.prompt[:80] if req.prompt else "",
            metadata={
                "size": normalized_size,
                "loop": bool(req.loop_hint),
                "video_type": req.video_type or "standard",
                "style_preset": req.style_preset,
                "camera_motion": req.camera_motion,
                "seed": req.seed,
            },
        )
    except Exception:
        pass
    jobs_module.set_result(
        job_id,
        {
            "out_path": loop_path,
            "provider": "sora-2",
            "seconds": req.duration_seconds,
            "size": normalized_size,
        },
    )
    return {
        "ok": True,
        "status": "ready",
        "job_id": job_id,
        "loop_path": loop_path,
        "note": "Generated via Sora 2 (direct binary path)",
    }


@router.get("/generate/video/status")
def get_video_status(
    job_id: str,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
    backend_job_id: Optional[str] = None,
):
    """
    Check status of a Sora 2 video job by its ID returned from /generate/video.
    If finished, attempt to download the binary and save it locally.
    """

    user_id = user["id"]
    openai_key = get_openai_key_for_user(user_id)

    headers = {"Authorization": f"Bearer {openai_key}"}

    meta_resp = requests.get(
        f"https://api.openai.com/v1/videos/{job_id}",
        headers=headers,
        timeout=60,
    )

    if meta_resp.status_code >= 400:
        if backend_job_id:
            jobs_module.set_error(
                backend_job_id,
                f"Failed to get Sora status: {meta_resp.text}",
                progress=None,
            )
        raise HTTPException(
            status_code=meta_resp.status_code,
            detail=f"Failed to get status: {meta_resp.text}",
        )

    try:
        meta = meta_resp.json()
    except Exception as exc:
        if backend_job_id:
            jobs_module.set_error(backend_job_id, "Status response was not JSON")
        raise HTTPException(
            status_code=500, detail="Status response was not JSON"
        ) from exc

    status = meta.get("status", "unknown")

    if status in ("queued", "processing", "running"):
        if backend_job_id:
            jobs_module.update_job_status(
                backend_job_id,
                stage=status,
                status="running",
                progress=meta.get("progress"),
            )
        return {
            "ok": True,
            "status": status,
            "job_id": job_id,
            "backend_job_id": backend_job_id,
            "progress": meta.get("progress"),
            "seconds": meta.get("seconds"),
            "size": meta.get("size"),
        }

    if status == "failed":
        if backend_job_id:
            jobs_module.set_error(
                backend_job_id,
                str(meta.get("error", "Generation failed")),
                progress=None,
            )
        raise HTTPException(
            status_code=500, detail=meta.get("error", "Generation failed")
        )

    if status == "completed":
        video_url = meta.get("video_url") or meta.get("result_url") or meta.get("url")

        settings = get_settings()
        uploads_dir = os.path.join(settings.USER_CONTENT_DIR, "uploads")
        os.makedirs(uploads_dir, exist_ok=True)

        out_name = f"sora2_{user_id}_{job_id}.mp4"
        out_disk_path = os.path.join(uploads_dir, out_name)

        if video_url:
            dl = requests.get(video_url, headers=headers, timeout=120)
            if dl.status_code >= 400:
                if backend_job_id:
                    jobs_module.set_error(
                        backend_job_id,
                        f"Download via video_url failed: {dl.text}",
                        progress=None,
                    )
                raise HTTPException(
                    status_code=500, detail=f"Download via video_url failed: {dl.text}"
                )
            with open(out_disk_path, "wb") as f:
                f.write(dl.content)
        else:
            bin_resp = requests.get(
                f"https://api.openai.com/v1/videos/{job_id}/content",
                headers=headers,
                timeout=120,
            )

            if bin_resp.status_code >= 400:
                if backend_job_id:
                    jobs_module.set_error(
                        backend_job_id,
                        f"Download via /content failed: {bin_resp.text}",
                        progress=None,
                    )
                raise HTTPException(
                    status_code=500,
                    detail=f"Download via /content failed: {bin_resp.text}",
                )

            ctype = bin_resp.headers.get("Content-Type", "").lower()
            if "application/json" in ctype:
                if backend_job_id:
                    jobs_module.update_job_status(
                        backend_job_id,
                        stage="completed_metadata",
                        status="running",
                        progress=meta.get("progress"),
                    )
                return {
                    "ok": False,
                    "status": "completed",
                    "job_id": job_id,
                    "backend_job_id": backend_job_id,
                    "note": "Video metadata ready but binary not returned. Inspect meta.",
                    "meta": meta,
                    "raw": bin_resp.text,
                }

            with open(out_disk_path, "wb") as f:
                f.write(bin_resp.content)

        loop_path = f"content/uploads/{out_name}".replace("\\", "/")
        if backend_job_id:
            jobs_module.set_result(
                backend_job_id,
                {
                    "out_path": loop_path,
                    "provider": "sora-2",
                    "seconds": meta.get("seconds"),
                    "size": meta.get("size"),
                },
            )
        return {
            "ok": True,
            "status": "ready",
            "loop_path": loop_path,
            "seconds": meta.get("seconds"),
            "size": meta.get("size"),
            "backend_job_id": backend_job_id,
        }

    if backend_job_id:
        jobs_module.update_job_status(
            backend_job_id, stage=status, status="running", progress=None
        )
    return {
        "ok": False,
        "status": status,
        "meta": meta,
        "backend_job_id": backend_job_id,
    }


__all__ = ["router", "parse_eleven_generate_form"]
