"""Helpers for retrieving decrypted API keys for a user."""

from __future__ import annotations

import os

import requests
from fastapi import HTTPException

from modules.auth import decrypt_value
from modules.users import list_user_keys

YOUTUBE_SCOPES = (
    "https://www.googleapis.com/auth/youtube.readonly "
    "https://www.googleapis.com/auth/youtube.upload"
)


def get_openai_key_for_user(user_id: int) -> str:
    raw = list_user_keys(user_id)
    cipher = raw.get("openai")
    if not cipher:
        raise HTTPException(
            status_code=400,
            detail="No OpenAI API key on file. Save one via /profile/keys.",
        )
    return decrypt_value(cipher)


def get_eleven_key_for_user(user_id: int) -> str:
    raw = list_user_keys(user_id)
    cipher = raw.get("elevenlabs")
    if not cipher:
        raise HTTPException(
            status_code=400,
            detail="No ElevenLabs API key on file. Save one via /profile/keys.",
        )
    return decrypt_value(cipher)


def get_youtube_refresh_token(user_id: int) -> str:
    raw = list_user_keys(user_id)
    cipher = raw.get("youtube_refresh")
    if not cipher:
        raise HTTPException(
            status_code=400,
            detail="No YouTube refresh token on file. Hit /youtube/auth/url and finish OAuth.",
        )
    return decrypt_value(cipher)


def exchange_youtube_refresh(refresh_token: str) -> str:
    data = {
        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    r = requests.post("https://oauth2.googleapis.com/token", data=data, timeout=30)
    if r.status_code >= 400:
        raise HTTPException(
            status_code=500, detail=f"Could not refresh YouTube token: {r.text}"
        )

    token_payload = r.json()
    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=500, detail="Missing access_token in refresh response"
        )
    return access_token


__all__ = [
    "YOUTUBE_SCOPES",
    "exchange_youtube_refresh",
    "get_eleven_key_for_user",
    "get_openai_key_for_user",
    "get_youtube_refresh_token",
]
