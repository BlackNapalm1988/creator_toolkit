"""Voiceover generation helpers."""

from __future__ import annotations

import json
import os
import uuid
from typing import Optional

import requests
from fastapi import HTTPException

from app.services.keys import get_eleven_key_for_user


def generate_voiceover_mp3_for_user(
    user_id: int,
    text: str,
    voice_id: str,
    model_id: Optional[str] = None,
) -> str:
    """Generate speech audio using the user's ElevenLabs credentials."""

    api_key = get_eleven_key_for_user(user_id)

    out_dir = os.path.join("static", "tts")
    os.makedirs(out_dir, exist_ok=True)
    out_name = f"{user_id}_{uuid.uuid4().hex}.mp3"
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

    return out_path


__all__ = ["generate_voiceover_mp3_for_user"]
