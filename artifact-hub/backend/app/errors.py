from __future__ import annotations

from typing import Any

from fastapi import HTTPException


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "details": details or {}},
        )


def ok(data: Any) -> dict[str, Any]:
    return {"ok": True, "data": data}
