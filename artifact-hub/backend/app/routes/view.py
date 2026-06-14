from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError, ok
from ..models import Artifact, ArtifactSession
from ..security import require_admin, verify_admin_cookie, verify_view_token
from ..storage import absolute_from_relative, content_type_for_path, resolve_bundle_file
from .deps import artifact_summary, download_url, get_token, is_expired, raw_url, view_url

router = APIRouter(tags=["view"])


def raw_headers(path: Path) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    }
    suffix = path.suffix.lower()
    if suffix in {".html", ".htm", ".svg"}:
        headers["Content-Security-Policy"] = "default-src 'self' data: blob:; object-src 'none'; base-uri 'none'"
    return headers


def session_access_level(session: ArtifactSession, request: Request, settings: Settings) -> tuple[str, str | None]:
    token = get_token(request)
    if is_expired(session.expires_at):
        raise AppError(403, "TOKEN_EXPIRED", "Session has expired")
    if verify_admin_cookie(request.cookies.get("ah_admin_session"), settings):
        return "admin", token
    if verify_view_token(session.id, session.share_token_hash, token, settings):
        return "token", token
    return "public", token


def allowed_artifacts_for_level(artifacts: list[Artifact], level: str) -> list[Artifact]:
    if level == "admin":
        return artifacts
    if level == "token":
        return [artifact for artifact in artifacts if artifact.visibility in {"token", "public"}]
    return [artifact for artifact in artifacts if artifact.visibility == "public"]


def load_artifact(artifact_id: str, db: Session) -> Artifact:
    artifact = db.scalars(select(Artifact).where(Artifact.id == artifact_id)).first()
    if artifact is None:
        raise AppError(404, "NOT_FOUND", "Artifact not found")
    return artifact


def ensure_artifact_access(artifact: Artifact, request: Request, settings: Settings, path_token: str | None = None) -> str | None:
    if is_expired(artifact.expires_at) or is_expired(artifact.session.expires_at):
        raise AppError(403, "TOKEN_EXPIRED", "Artifact or session has expired")
    token = None if path_token == "public" else path_token
    token = token or get_token(request)
    if artifact.visibility == "public":
        return token
    if artifact.visibility == "token" and verify_view_token(artifact.session_id, artifact.session.share_token_hash, token, settings):
        return token
    if verify_admin_cookie(request.cookies.get("ah_admin_session"), settings):
        return token
    raise AppError(403, "TOKEN_INVALID", "Valid view token required")


@router.get("/api/v1/view/sessions/{session_id}")
def view_session(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    session = db.get(ArtifactSession, session_id)
    if session is None:
        raise AppError(404, "NOT_FOUND", "Session not found")
    level, token = session_access_level(session, request, settings)
    artifacts = allowed_artifacts_for_level(sorted(session.artifacts, key=lambda item: item.created_at, reverse=True), level)
    return ok(
        {
            "sessionId": session.id,
            "title": session.title,
            "source": session.source,
            "createdAt": session.created_at,
            "updatedAt": session.updated_at,
            "artifacts": [artifact_summary(settings, artifact, token) for artifact in artifacts],
        }
    )


@router.get("/api/v1/view/artifacts/{artifact_id}")
def view_artifact(
    artifact_id: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    artifact = load_artifact(artifact_id, db)
    token = ensure_artifact_access(artifact, request, settings)
    level, _ = session_access_level(artifact.session, request, settings)
    siblings = allowed_artifacts_for_level(sorted(artifact.session.artifacts, key=lambda item: item.created_at, reverse=True), level)
    return ok(
        {
            "artifactId": artifact.id,
            "sessionId": artifact.session_id,
            "title": artifact.title,
            "description": artifact.description,
            "filename": artifact.filename,
            "kind": artifact.kind,
            "mimeType": artifact.mime_type,
            "sizeBytes": artifact.size_bytes,
            "sha256": artifact.sha256,
            "createdAt": artifact.created_at,
            "contentUrl": raw_url(settings, artifact, token, artifact.entry_path or "blob"),
            "downloadUrl": download_url(settings, artifact, token),
            "trustedHtml": artifact.trusted_html,
            "entryPath": artifact.entry_path,
            "siblings": [artifact_summary(settings, sibling, token) for sibling in siblings],
        }
    )


@router.get("/r/{artifact_id}/{token}/{path:path}")
def raw_artifact(
    artifact_id: str,
    token: str,
    path: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    artifact = load_artifact(artifact_id, db)
    ensure_artifact_access(artifact, request, settings, token)
    if artifact.kind == "html-bundle":
        bundle_root = absolute_from_relative(artifact.storage_path, settings)
        file_path = resolve_bundle_file(bundle_root, path, artifact.entry_path)
        media_type = content_type_for_path(file_path)
        return FileResponse(
            file_path,
            media_type=media_type,
            filename=file_path.name,
            headers=raw_headers(file_path),
            content_disposition_type="inline",
        )
    if path != "blob":
        raise AppError(404, "NOT_FOUND", "Single-file artifacts only expose /blob")
    file_path = absolute_from_relative(artifact.storage_path, settings)
    return FileResponse(
        file_path,
        media_type=artifact.mime_type,
        filename=artifact.filename,
        headers=raw_headers(Path(artifact.filename)),
        content_disposition_type="inline",
    )


@router.get("/download/{artifact_id}")
def download_artifact(
    artifact_id: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    artifact = load_artifact(artifact_id, db)
    ensure_artifact_access(artifact, request, settings)
    if artifact.kind == "html-bundle":
        bundle_root = absolute_from_relative(artifact.storage_path, settings)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for file_path in bundle_root.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, file_path.relative_to(bundle_root).as_posix())
        buffer.seek(0)
        filename = artifact.filename if artifact.filename.endswith(".zip") else f"{artifact.filename}.zip"
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    file_path = absolute_from_relative(artifact.storage_path, settings)
    return FileResponse(file_path, media_type=artifact.mime_type, filename=artifact.filename, headers={"Content-Disposition": f'attachment; filename="{artifact.filename}"'})
