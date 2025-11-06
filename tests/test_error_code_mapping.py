import json

import pytest
from fastapi import HTTPException

from app.web import errors as err


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status, expected",
    [
        (409, "conflict"),
        (410, "gone"),
        (422, "validation_error"),
        (429, "too_many_requests"),
        (418, "error"),  # default bucket
    ],
)
async def test_http_exception_code_mapping(status, expected):
    exc = HTTPException(status_code=status, detail="test")
    resp = await err.http_exception_handler(object(), exc)
    assert resp.status_code == status
    data = json.loads(resp.body)
    assert data["error"]["code"] == expected
