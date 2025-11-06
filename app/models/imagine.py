"""Pydantic models for Imagine-related endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ImagineThreadCreateReq(BaseModel):
    model: str | None = None
    title: str | None = None


class ImagineSendReq(BaseModel):
    thread_id: str
    message: str


class ImagineChatReq(BaseModel):
    message: str


class ImagineChatResp(BaseModel):
    reply: str


__all__ = [
    "ImagineThreadCreateReq",
    "ImagineSendReq",
    "ImagineChatReq",
    "ImagineChatResp",
]
