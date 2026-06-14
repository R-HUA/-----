from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Header, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..artifact_kind import VALID_KINDS, infer_kind, infer_mime_type
from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError, ok
from ..models import ApiKey, Artifact, ArtifactSession, AuditEvent, IdempotencyKey
from ..schemas import ArtifactJsonUploadRequest
from ..security import (
    expires_from_default,
    issue_view_token,
    new_artifact_id,
    new_share_token_marker,
    request_hash,
    require_api_key,
    sha256_bytes,
    utcnow,
    validate_session_id,
)
from ..storage import dir_size, save_blob, save_bundle_zip
from .deps import download_url, raw_url, view_url

router = APIRouter(prefix="/api/v1/artifacts", tags=["artifacts"])

VISIBILITIES = {"private", "token", "public"}


def ensure_session(db: Session, settings: Settings, session_id: str, api_key: ApiKey) -> tuple[ArtifactSession, str | None]:
    session_id = validate_session_id(session_id)
    now = utcnow()
    session = db.get(ArtifactSession, session_id)
    if session is None:
        session = ArtifactSession(
            id=session_id,
            owner_key_id=api_key.id,
            share_token_hash=new_share_token_marker(settings),
            created_at=now,
            updated_at=now,
            expires_at=expires_from_default(settings),
            metadata_json={},
        )
        db.add(session)
    else:
        if session.share_token_hash is None:
            session.share_token_hash = new_share_token_marker(settings)
        session.updated_at = now
    token = issue_view_token(session_id, session.share_token_hash, settings) if session.share_token_hash else None
    return session, token


def parse_metadata(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise AppError(400, "INVALID_REQUEST", "metadata must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise AppError(400, "INVALID_REQUEST", "metadata must be a JSON object")
    return parsed


def validate_visibility(value: str | None, settings: Settings) -> str:
    visibility = value or settings.default_visibility
    if visibility not in VISIBILITIES:
        raise AppError(400, "INVALID_REQUEST", "visibility must be private, token, or public")
    return visibility


def make_upload_response(settings: Settings, artifact: Artifact, token: str | None) -> dict[str, Any]:
    raw_path = artifact.entry_path or "blob"
    return {
        "artifactId": artifact.id,
        "sessionId": artifact.session_id,
        "kind": artifact.kind,
        "viewUrl": view_url(settings, artifact.session_id, artifact.id, token),
        "rawUrl": raw_url(settings, artifact, token, raw_path),
        "downloadUrl": download_url(settings, artifact, token),
        "sessionUrl": view_url(settings, artifact.session_id, None, token),
    }


def idempotent_response(
    db: Session,
    settings: Settings,
    api_key: ApiKey,
    idempotency_key: str | None,
    current_request_hash: str,
) -> dict[str, Any] | None:
    if not idempotency_key:
        return None
    existing = db.scalars(
        select(IdempotencyKey).where(
            IdempotencyKey.api_key_id == api_key.id,
            IdempotencyKey.idempotency_key == idempotency_key,
        )
    ).first()
    if existing is None:
        return None
    if existing.request_hash != current_request_hash:
        raise AppError(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different request")
    artifact = db.get(Artifact, existing.artifact_id)
    if artifact is None:
        return None
    token = issue_view_token(artifact.session_id, artifact.session.share_token_hash, settings)
    return make_upload_response(settings, artifact, token)


def record_idempotency(
    db: Session,
    api_key: ApiKey,
    idempotency_key: str | None,
    current_request_hash: str,
    artifact_id: str,
) -> None:
    if not idempotency_key:
        return
    db.add(
        IdempotencyKey(
            api_key_id=api_key.id,
            idempotency_key=idempotency_key,
            request_hash=current_request_hash,
            artifact_id=artifact_id,
            created_at=utcnow(),
        )
    )


def add_audit(db: Session, api_key: ApiKey, action: str, resource_type: str, resource_id: str, metadata: dict[str, Any] | None = None) -> None:
    db.add(
        AuditEvent(
            actor_type="api_key",
            actor_id=str(api_key.id),
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            created_at=utcnow(),
            metadata_json=metadata or {},
        )
    )


def create_artifact(
    db: Session,
    settings: Settings,
    api_key: ApiKey,
    session_id: str,
    title: str | None,
    description: str | None,
    filename: str,
    explicit_kind: str | None,
    mime_type: str | None,
    content: bytes,
    visibility: str,
    metadata: dict[str, Any],
    entry_path: str | None = None,
    is_bundle: bool = False,
) -> tuple[Artifact, str | None]:
    session, token = ensure_session(db, settings, session_id, api_key)
    now = utcnow()
    artifact_id = new_artifact_id()
    kind = "html-bundle" if is_bundle else infer_kind(filename, mime_type, explicit_kind, content[:4096])
    if kind not in VALID_KINDS:
        raise AppError(400, "INVALID_REQUEST", "Unsupported artifact kind")
    resolved_mime = infer_mime_type(filename, kind, mime_type)
    sha = sha256_bytes(content)

    if is_bundle:
        stored = save_bundle_zip(
            artifact_id,
            content,
            now,
            entry_path or "index.html",
            {"filename": filename, "sha256": sha, "kind": kind, **metadata},
            settings,
        )
        size_bytes = dir_size(stored.absolute_path)
    else:
        stored = save_blob(
            artifact_id,
            content,
            now,
            {"filename": filename, "sha256": sha, "kind": kind, **metadata},
            settings,
        )
        size_bytes = len(content)

    artifact = Artifact(
        id=artifact_id,
        session_id=session.id,
        title=title or filename,
        description=description,
        filename=filename,
        kind=kind,
        mime_type=resolved_mime,
        size_bytes=size_bytes,
        sha256=sha,
        storage_path=stored.relative_path,
        entry_path=entry_path if is_bundle else None,
        visibility=visibility,
        trusted_html=False,
        created_by_key_id=api_key.id,
        created_at=now,
        expires_at=expires_from_default(settings),
        metadata_json=metadata,
    )
    db.add(artifact)
    add_audit(db, api_key, "artifact.create", "artifact", artifact_id, {"sessionId": session.id, "kind": kind})
    return artifact, token


@router.post("")
def upload_json_artifact(
    payload: ArtifactJsonUploadRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    api_key: ApiKey = Depends(require_api_key("write:artifact")),
):
    content = payload.content.encode("utf-8")
    current_hash = request_hash(
        {
            "sessionId": payload.session_id,
            "filename": payload.filename,
            "contentSha256": sha256_bytes(content),
            "kind": payload.kind,
        }
    )
    existing = idempotent_response(db, settings, api_key, idempotency_key, current_hash)
    if existing:
        return ok(existing)

    visibility = validate_visibility(payload.visibility, settings)
    artifact, token = create_artifact(
        db,
        settings,
        api_key,
        payload.session_id,
        payload.title,
        payload.description,
        payload.filename,
        payload.kind,
        payload.mime_type,
        content,
        visibility,
        payload.metadata,
    )
    record_idempotency(db, api_key, idempotency_key, current_hash, artifact.id)
    db.commit()
    db.refresh(artifact)
    return ok(make_upload_response(settings, artifact, token))


@router.post("/upload")
async def upload_file_artifact(
    session_id: str = Form(alias="sessionId"),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    kind: str | None = Form(default=None),
    visibility: str | None = Form(default=None),
    metadata: str | None = Form(default=None),
    file: UploadFile = File(),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    api_key: ApiKey = Depends(require_api_key("write:artifact")),
):
    content = await file.read()
    current_hash = request_hash({"sessionId": session_id, "filename": file.filename, "contentSha256": sha256_bytes(content), "kind": kind})
    existing = idempotent_response(db, settings, api_key, idempotency_key, current_hash)
    if existing:
        return ok(existing)
    artifact, token = create_artifact(
        db,
        settings,
        api_key,
        session_id,
        title,
        description,
        file.filename or "upload.bin",
        kind,
        file.content_type,
        content,
        validate_visibility(visibility, settings),
        parse_metadata(metadata),
    )
    record_idempotency(db, api_key, idempotency_key, current_hash, artifact.id)
    db.commit()
    db.refresh(artifact)
    return ok(make_upload_response(settings, artifact, token))


@router.post("/bundle")
async def upload_bundle_artifact(
    session_id: str = Form(alias="sessionId"),
    title: str | None = Form(default=None),
    entry_path: str = Form(default="index.html", alias="entryPath"),
    visibility: str | None = Form(default=None),
    metadata: str | None = Form(default=None),
    file: UploadFile = File(),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    api_key: ApiKey = Depends(require_api_key("write:artifact")),
):
    content = await file.read()
    current_hash = request_hash({"sessionId": session_id, "filename": file.filename, "contentSha256": sha256_bytes(content), "entryPath": entry_path})
    existing = idempotent_response(db, settings, api_key, idempotency_key, current_hash)
    if existing:
        return ok(existing)
    artifact, token = create_artifact(
        db,
        settings,
        api_key,
        session_id,
        title,
        None,
        file.filename or "bundle.zip",
        "html-bundle",
        "application/zip",
        content,
        validate_visibility(visibility, settings),
        parse_metadata(metadata),
        entry_path=entry_path,
        is_bundle=True,
    )
    record_idempotency(db, api_key, idempotency_key, current_hash, artifact.id)
    db.commit()
    db.refresh(artifact)
    return ok(make_upload_response(settings, artifact, token))
