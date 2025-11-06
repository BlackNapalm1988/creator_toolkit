import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError

from app.web import errors as err


@pytest.mark.asyncio
async def test_http_exception_passes_through_existing_envelope():
    detail = {"error": {"code": "conflict", "message": "dup"}}
    exc = HTTPException(status_code=409, detail=detail)
    resp = await err.http_exception_handler(object(), exc)
    assert resp.status_code == 409
    assert resp.body
    body = resp.body.decode()
    assert '"conflict"' in body
    assert '"dup"' in body


@pytest.mark.asyncio
async def test_generic_exception_handler_returns_internal_error():
    exc = RuntimeError("boom")
    resp = await err.generic_exception_handler(object(), exc)
    assert resp.status_code == 500
    payload = resp.body.decode()
    assert "internal_error" in payload


@pytest.mark.asyncio
async def test_request_validation_error_envelope_direct():
    rv = RequestValidationError(errors=[{"loc": ["body", "field"], "msg": "missing"}])
    resp = await err.request_validation_exception_handler(object(), rv)
    assert resp.status_code == 422
    body = resp.body.decode()
    assert "validation_error" in body
    assert "Validation failed" in body


class _DemoModel(BaseModel):
    a: int


@pytest.mark.asyncio
async def test_pydantic_validation_error_envelope_direct():
    try:
        _DemoModel(a="x")
    except ValidationError as ve:
        resp = await err.pydantic_validation_exception_handler(object(), ve)
        assert resp.status_code == 422
        payload = resp.body.decode()
        assert "validation_error" in payload
        assert "Validation failed" in payload
