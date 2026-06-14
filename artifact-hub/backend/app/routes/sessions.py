from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db import get_db
from ..errors import ok
from ..models import ApiKey
from ..schemas import SessionUpsertRequest
from ..security import expires_from_default, issue_view_token, new_share_token_marker, require_api_key, utcnow, validate_session_id
from .deps import view_url

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.post("")
def upsert_session(
    payload: SessionUpsertRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    api_key: ApiKey = Depends(require_api_key("write:artifact")),
):
    from ..models import ArtifactSession

    session_id = validate_session_id(payload.session_id)
    now = utcnow()
    session = db.get(ArtifactSession, session_id)
    if session is None:
        token_marker = new_share_token_marker(settings)
        session = ArtifactSession(
            id=session_id,
            title=payload.title,
            source=payload.source,
            owner_key_id=api_key.id,
            share_token_hash=token_marker,
            created_at=now,
            updated_at=now,
            expires_at=expires_from_default(settings),
            metadata_json=payload.metadata,
        )
        db.add(session)
    else:
        if payload.title is not None:
            session.title = payload.title
        if payload.source is not None:
            session.source = payload.source
        if payload.metadata:
            session.metadata_json = payload.metadata
        if session.share_token_hash is None:
            session.share_token_hash = new_share_token_marker(settings)
        session.updated_at = now
    db.commit()
    token = issue_view_token(session_id, session.share_token_hash, settings)
    return ok({"sessionId": session_id, "sessionUrl": view_url(settings, session_id, None, token)})
