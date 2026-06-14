from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError
from ..models import Artifact, ArtifactSession
from ..security import require_admin, utcnow, verify_view_token


def is_expired(value: datetime | None) -> bool:
    return value is not None and value <= utcnow()


def get_token(request: Request) -> str | None:
    token = request.query_params.get("t")
    if token:
        return token
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def ensure_view_access(artifact: Artifact, request: Request) -> str | None:
    token = get_token(request)
    if is_expired(artifact.expires_at) or is_expired(artifact.session.expires_at):
        raise AppError(403, "TOKEN_EXPIRED", "Artifact or session has expired")
    if artifact.visibility == "public":
        return token
    if artifact.visibility == "token" and verify_view_token(artifact.session_id, artifact.session.share_token_hash, token):
        return token
    try:
        require_admin(request, get_settings())
        return token
    except AppError:
        pass
    raise AppError(403, "TOKEN_INVALID", "Valid view token required")


def load_artifact_for_view(
    artifact_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> tuple[Artifact, str | None]:
    artifact = db.scalars(select(Artifact).where(Artifact.id == artifact_id)).first()
    if artifact is None:
        raise AppError(404, "NOT_FOUND", "Artifact not found")
    token = ensure_view_access(artifact, request)
    return artifact, token


def view_url(settings: Settings, session_id: str, artifact_id: str | None, token: str | None) -> str:
    if artifact_id:
        base = f"{settings.public_base_url}/v/{session_id}/{artifact_id}"
    else:
        base = f"{settings.public_base_url}/v/{session_id}"
    return f"{base}?t={token}" if token else base


def raw_url(settings: Settings, artifact: Artifact, token: str | None, path: str | None = None) -> str:
    raw_token = token or "public"
    raw_path = path or artifact.entry_path or "blob"
    return f"{settings.public_base_url}/r/{artifact.id}/{raw_token}/{raw_path}"


def download_url(settings: Settings, artifact: Artifact, token: str | None) -> str:
    base = f"{settings.public_base_url}/download/{artifact.id}"
    return f"{base}?t={token}" if token else base


def artifact_summary(settings: Settings, artifact: Artifact, token: str | None) -> dict:
    return {
        "artifactId": artifact.id,
        "sessionId": artifact.session_id,
        "title": artifact.title,
        "filename": artifact.filename,
        "kind": artifact.kind,
        "mimeType": artifact.mime_type,
        "sizeBytes": artifact.size_bytes,
        "createdAt": artifact.created_at,
        "viewUrl": view_url(settings, artifact.session_id, artifact.id, token),
    }
