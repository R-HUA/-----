from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import __version__
from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError, ok
from ..models import ApiKey, Artifact, ArtifactSession, AuditEvent
from ..schemas import AdminLoginRequest, ApiKeyCreateRequest, ArtifactUpdateRequest, CleanupRequest, SessionUpdateRequest
from ..security import (
    ADMIN_COOKIE_NAME,
    create_api_key,
    issue_view_token,
    make_admin_cookie,
    new_share_token_marker,
    require_admin,
    utcnow,
)
from ..storage import dir_size, object_root, remove_artifact_storage
from .deps import artifact_summary, download_url, raw_url, view_url

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def admin_artifact_payload(settings: Settings, artifact: Artifact) -> dict:
    token = issue_view_token(artifact.session_id, artifact.session.share_token_hash, settings) if artifact.session.share_token_hash else None
    return {
        "artifactId": artifact.id,
        "sessionId": artifact.session_id,
        "title": artifact.title,
        "description": artifact.description,
        "filename": artifact.filename,
        "kind": artifact.kind,
        "mimeType": artifact.mime_type,
        "sizeBytes": artifact.size_bytes,
        "sha256": artifact.sha256,
        "storagePath": artifact.storage_path,
        "entryPath": artifact.entry_path,
        "visibility": artifact.visibility,
        "trustedHtml": artifact.trusted_html,
        "createdAt": artifact.created_at,
        "metadata": artifact.metadata_json,
        "viewUrl": view_url(settings, artifact.session_id, artifact.id, token),
        "contentUrl": raw_url(settings, artifact, token, artifact.entry_path or "blob"),
        "rawUrl": raw_url(settings, artifact, token, artifact.entry_path or "blob"),
        "downloadUrl": download_url(settings, artifact, token),
        "siblings": [artifact_summary(settings, sibling, token) for sibling in artifact.session.artifacts],
    }


def audit(db: Session, action: str, resource_type: str, resource_id: str | None = None, metadata: dict | None = None) -> None:
    db.add(
        AuditEvent(
            actor_type="admin",
            actor_id="admin",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            created_at=utcnow(),
            metadata_json=metadata or {},
        )
    )


def share_token(settings: Settings, session: ArtifactSession) -> str | None:
    return issue_view_token(session.id, session.share_token_hash, settings) if session.share_token_hash else None


@router.post("/login")
def login(payload: AdminLoginRequest, response: Response, settings: Settings = Depends(get_settings)):
    if payload.password != settings.admin_password:
        raise AppError(401, "UNAUTHORIZED", "Invalid admin password")
    response.set_cookie(
        ADMIN_COOKIE_NAME,
        make_admin_cookie(settings),
        httponly=True,
        samesite="lax",
        secure=settings.public_base_url.startswith("https://"),
        max_age=7 * 24 * 3600,
    )
    return ok({"authenticated": True})


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(ADMIN_COOKIE_NAME)
    return ok({"authenticated": False})


@router.get("/me")
def me(_: bool = Depends(require_admin)):
    return ok({"authenticated": True})


@router.get("/system")
def system(
    _: bool = Depends(require_admin),
    settings: Settings = Depends(get_settings),
):
    return ok(
        {
            "version": __version__,
            "publicBaseUrl": settings.public_base_url,
            "dataDir": str(settings.data_dir),
            "database": "postgresql",
            "storageBytes": dir_size(object_root(settings)),
        }
    )


@router.get("/sessions")
def list_sessions(
    q: str | None = None,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    sessions = db.scalars(select(ArtifactSession).order_by(ArtifactSession.updated_at.desc())).all()
    if q:
        needle = q.lower()
        sessions = [
            session
            for session in sessions
            if needle in session.id.lower()
            or (session.title and needle in session.title.lower())
            or (session.source and needle in session.source.lower())
        ]
    payload = []
    for session in sessions:
        artifacts = session.artifacts
        payload.append(
            {
                "sessionId": session.id,
                "title": session.title,
                "source": session.source,
                "artifactCount": len(artifacts),
                "totalSizeBytes": sum(artifact.size_bytes for artifact in artifacts),
                "createdAt": session.created_at,
                "updatedAt": session.updated_at,
                "expiresAt": session.expires_at,
                "sessionUrl": view_url(settings, session.id, None, share_token(settings, session)),
            }
        )
    return ok({"sessions": payload})


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    session = db.get(ArtifactSession, session_id)
    if session is None:
        raise AppError(404, "NOT_FOUND", "Session not found")
    return ok(
        {
            "sessionId": session.id,
            "title": session.title,
            "source": session.source,
            "createdAt": session.created_at,
            "updatedAt": session.updated_at,
            "expiresAt": session.expires_at,
            "metadata": session.metadata_json,
            "sessionUrl": view_url(settings, session.id, None, share_token(settings, session)),
            "artifacts": [admin_artifact_payload(settings, artifact) for artifact in sorted(session.artifacts, key=lambda item: item.created_at, reverse=True)],
        }
    )


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str,
    payload: SessionUpdateRequest,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    session = db.get(ArtifactSession, session_id)
    if session is None:
        raise AppError(404, "NOT_FOUND", "Session not found")
    if payload.title is not None:
        session.title = payload.title
    if payload.source is not None:
        session.source = payload.source
    if payload.metadata is not None:
        session.metadata_json = payload.metadata
    session.updated_at = utcnow()
    audit(db, "session.update", "session", session_id)
    db.commit()
    return ok({"updated": True})


@router.post("/sessions/{session_id}/rotate-token")
def rotate_session_token(
    session_id: str,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    session = db.get(ArtifactSession, session_id)
    if session is None:
        raise AppError(404, "NOT_FOUND", "Session not found")
    session.share_token_hash = new_share_token_marker(settings)
    session.updated_at = utcnow()
    audit(db, "session.rotate_token", "session", session_id)
    db.commit()
    return ok({"sessionUrl": view_url(settings, session.id, None, share_token(settings, session))})


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    session = db.get(ArtifactSession, session_id)
    if session is None:
        raise AppError(404, "NOT_FOUND", "Session not found")
    for artifact in list(session.artifacts):
        remove_artifact_storage(artifact.storage_path)
    db.delete(session)
    audit(db, "session.delete", "session", session_id)
    db.commit()
    return ok({"deleted": True})


@router.get("/artifacts/{artifact_id}")
def get_artifact(
    artifact_id: str,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise AppError(404, "NOT_FOUND", "Artifact not found")
    return ok(admin_artifact_payload(settings, artifact))


@router.patch("/artifacts/{artifact_id}")
def update_artifact(
    artifact_id: str,
    payload: ArtifactUpdateRequest,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise AppError(404, "NOT_FOUND", "Artifact not found")
    if payload.title is not None:
        artifact.title = payload.title
    if payload.description is not None:
        artifact.description = payload.description
    if payload.visibility is not None:
        artifact.visibility = payload.visibility
    if payload.trusted_html is not None:
        artifact.trusted_html = payload.trusted_html
    if payload.metadata is not None:
        artifact.metadata_json = payload.metadata
    artifact.session.updated_at = utcnow()
    audit(db, "artifact.update", "artifact", artifact_id)
    db.commit()
    return ok({"updated": True})


@router.delete("/artifacts/{artifact_id}")
def delete_artifact(
    artifact_id: str,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise AppError(404, "NOT_FOUND", "Artifact not found")
    remove_artifact_storage(artifact.storage_path)
    db.delete(artifact)
    audit(db, "artifact.delete", "artifact", artifact_id)
    db.commit()
    return ok({"deleted": True})


@router.get("/api-keys")
def list_api_keys(
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    keys = db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all()
    return ok(
        {
            "apiKeys": [
                {
                    "id": str(key.id),
                    "name": key.name,
                    "keyPrefix": key.key_prefix,
                    "scopes": key.scopes,
                    "createdAt": key.created_at,
                    "lastUsedAt": key.last_used_at,
                    "revokedAt": key.revoked_at,
                }
                for key in keys
            ]
        }
    )


@router.post("/api-keys")
def create_key(
    payload: ApiKeyCreateRequest,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    key_value, key_prefix, key_hash = create_api_key(payload.name, payload.scopes, settings)
    api_key = ApiKey(name=payload.name, key_prefix=key_prefix, key_hash=key_hash, scopes=payload.scopes, created_at=utcnow())
    db.add(api_key)
    audit(db, "api_key.create", "api_key", str(api_key.id), {"name": payload.name, "scopes": payload.scopes})
    db.commit()
    return ok({"id": str(api_key.id), "key": key_value, "keyPrefix": key_prefix, "scopes": payload.scopes})


@router.delete("/api-keys/{key_id}")
def revoke_key(
    key_id: str,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    api_key = db.get(ApiKey, key_id)
    if api_key is None:
        raise AppError(404, "NOT_FOUND", "API key not found")
    api_key.revoked_at = utcnow()
    audit(db, "api_key.revoke", "api_key", key_id)
    db.commit()
    return ok({"revoked": True})


@router.post("/cleanup")
def cleanup(
    payload: CleanupRequest,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.older_than_days is None:
        raise AppError(400, "INVALID_REQUEST", "olderThanDays is required")
    cutoff = utcnow() - timedelta(days=payload.older_than_days)
    artifacts = db.scalars(select(Artifact).where(Artifact.created_at < cutoff)).all()
    if payload.dry_run:
        return ok({"deletedArtifacts": 0, "matchedArtifacts": len(artifacts), "dryRun": True})
    for artifact in artifacts:
        remove_artifact_storage(artifact.storage_path)
        db.delete(artifact)
    audit(db, "cleanup.run", "system", None, {"olderThanDays": payload.older_than_days, "deletedArtifacts": len(artifacts)})
    db.commit()
    return ok({"deletedArtifacts": len(artifacts), "dryRun": False})


@router.get("/audit-events")
def audit_events(
    limit: int = 100,
    _: bool = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 500))
    events = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)).all()
    return ok(
        {
            "events": [
                {
                    "id": str(event.id),
                    "actorType": event.actor_type,
                    "actorId": event.actor_id,
                    "action": event.action,
                    "resourceType": event.resource_type,
                    "resourceId": event.resource_id,
                    "createdAt": event.created_at,
                    "metadata": event.metadata_json,
                }
                for event in events
            ]
        }
    )
