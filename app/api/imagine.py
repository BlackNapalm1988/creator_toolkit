"""Imagine domain API routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.constants import CREATOR_ROLES
from app.deps import require_role
from app.models.imagine import (
    ImagineChatReq,
    ImagineChatResp,
    ImagineSendReq,
    ImagineThreadCreateReq,
)
from modules.chat import (
    add_message,
    create_thread,
    get_messages,
    get_thread,
    list_threads,
)
from app.services.keys import get_openai_key_for_user

router = APIRouter(tags=["Imagine"])

ALLOWED_OPENAI_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "o4-mini",
]
OPENAI_MODEL = "gpt-4o-mini"


@router.get("/imagine/models")
def imagine_models(
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """Return the list of allowed OpenAI chat models."""

    return {"models": ALLOWED_OPENAI_MODELS, "default": OPENAI_MODEL}


@router.post("/imagine/thread")
def imagine_thread_create(
    req: ImagineThreadCreateReq,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """Create a new chat thread for brainstorming prompts."""

    model = req.model or OPENAI_MODEL
    if model not in ALLOWED_OPENAI_MODELS:
        raise HTTPException(status_code=400, detail="Model not allowed")

    tid = f"im_{uuid.uuid4().hex[:10]}"
    create_thread(tid, user["id"], model, req.title or "New chat")

    add_message(
        tid,
        "system",
        "You are a helpful creative copilot for short-form image/video workflows.",
    )

    return {"thread_id": tid}


@router.get("/imagine/threads")
def imagine_threads_list(
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """Return recent imagine threads for the signed-in user."""

    return {"threads": list_threads(user["id"])}


@router.get("/imagine/history/{thread_id}")
def imagine_history(
    thread_id: str,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """Fetch a thread plus the last N messages for review."""

    th = get_thread(thread_id)
    if not th:
        raise HTTPException(status_code=404, detail="thread not found")
    if th["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="forbidden")

    return {"thread": th, "messages": get_messages(thread_id, limit=60)}


@router.post("/imagine/send")
def imagine_send(
    req: ImagineSendReq,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """Send a chat message and stream the assistant's reply back."""

    th = get_thread(req.thread_id)
    if not th:
        raise HTTPException(status_code=404, detail="thread not found")
    if th["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="forbidden")

    content = (req.message or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="message cannot be empty")
    add_message(req.thread_id, "user", content)

    key = get_openai_key_for_user(user["id"])

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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {exc}") from exc

    add_message(req.thread_id, "assistant", reply)
    return {"reply": reply}


@router.post("/imagine/chat", response_model=ImagineChatResp)
def imagine_chat(
    req: ImagineChatReq,
    user: Annotated[dict, Depends(require_role(CREATOR_ROLES, require_verified=True))],
):
    """
    Lightweight 'writer's room' chat.
    Uses the user's saved OpenAI key to get creative guidance for visual/music ideas.
    """

    user_id = user["id"]
    openai_key = get_openai_key_for_user(user_id)

    system_msg = (
        "You are a creative assistant for a shortform lo-fi / moody / aesthetic video channel. "
        "You help brainstorm looping visual ideas, mood direction, aesthetic keywords, "
        "and audio direction for YouTube Shorts / TikTok style content using AI video + AI music. "
        "Keep responses specific, visual, and production-ready."
    )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=openai_key)
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": req.message},
            ],
            temperature=0.7,
            max_tokens=500,
        )
        reply = resp.choices[0].message.content
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {exc}") from exc

    return ImagineChatResp(reply=reply)


__all__ = ["router", "ALLOWED_OPENAI_MODELS", "OPENAI_MODEL"]
