from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError


def error_envelope(code: str, message: str, details: Optional[Any] = None) -> Dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


def _code_for_status(status_code: int) -> str:
    if status_code == 400:
        return "bad_request"
    if status_code == 401:
        return "unauthorized"
    if status_code == 403:
        return "forbidden"
    if status_code == 404:
        return "not_found"
    if status_code == 409:
        return "conflict"
    if status_code == 410:
        return "gone"
    if status_code == 422:
        return "validation_error"
    if status_code == 429:
        return "too_many_requests"
    if 500 <= status_code <= 599:
        return "internal_error"
    return "error"


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    # If the detail is already in the {"error": {...}} shape, pass through unchanged
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    message = str(exc.detail) if exc.detail is not None else ""
    code = _code_for_status(int(exc.status_code))
    return JSONResponse(status_code=exc.status_code, content=error_envelope(code, message))


async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = exc.errors()
    return JSONResponse(
        status_code=422,
        content=error_envelope("validation_error", "Validation failed", details=details),
    )


async def pydantic_validation_exception_handler(
    request: Request, exc: ValidationError
) -> JSONResponse:
    details = exc.errors()
    return JSONResponse(
        status_code=422,
        content=error_envelope("validation_error", "Validation failed", details=details),
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Avoid leaking internal details by default; attach minimal message
    return JSONResponse(
        status_code=500,
        content=error_envelope("internal_error", "Internal server error"),
    )

