from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import __version__
from ..config import Settings, get_settings
from ..errors import ok

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
def health(settings: Settings = Depends(get_settings)):
    return ok({"version": __version__, "publicBaseUrl": settings.public_base_url, "database": "postgresql"})
