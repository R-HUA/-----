from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_db
from .errors import AppError
from .models import ApiKey

SESSION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
ADMIN_COOKIE_NAME = "ah_admin_session"
API_KEY_PREFIX = "ahk_live_"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def validate_session_id(session_id: str) -> str:
    if not SESSION_ID_RE.fullmatch(session_id):
        raise AppError(400, "INVALID_REQUEST", "sessionId must match [A-Za-z0-9._:-]{1,128}")
    return session_id


def secret_hash(value: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    digest = hmac.new(settings.session_secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest


def constant_time_equal(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    return hmac.compare_digest(left, right)


def new_share_token() -> str:
    return "v_" + secrets.token_urlsafe(32)


def new_share_token_marker(settings: Settings | None = None) -> str:
    return secret_hash(new_share_token(), settings)


def issue_view_token(session_id: str, token_marker: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    session_b64 = base64.urlsafe_b64encode(session_id.encode("utf-8")).decode("ascii").rstrip("=")
    payload = f"v1.{session_b64}"
    signature = hmac.new(
        settings.session_secret.encode("utf-8"),
        f"{payload}.{token_marker}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{signature}"


def verify_view_token(session_id: str, token_marker: str | None, token: str | None, settings: Settings | None = None) -> bool:
    if not token_marker or not token:
        return False
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return constant_time_equal(token_marker, secret_hash(token, settings))
    expected = issue_view_token(session_id, token_marker, settings)
    return hmac.compare_digest(expected, token)


def create_api_key(name: str, scopes: list[str], settings: Settings | None = None) -> tuple[str, str, str]:
    settings = settings or get_settings()
    secret = secrets.token_urlsafe(32)
    key = API_KEY_PREFIX + secret
    key_prefix = key[:18]
    key_hash = secret_hash(key, settings)
    return key, key_prefix, key_hash


def verify_api_key_value(key_value: str, stored_hash: str, settings: Settings | None = None) -> bool:
    return constant_time_equal(secret_hash(key_value, settings), stored_hash)


def extract_bearer_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    header_key = request.headers.get("x-artifact-key")
    return header_key.strip() if header_key else None


def require_api_key(required_scope: str):
    def dependency(
        request: Request,
        db: Session = Depends(get_db),
        settings: Settings = Depends(get_settings),
    ) -> ApiKey:
        key_value = extract_bearer_token(request)
        if not key_value:
            raise AppError(401, "UNAUTHORIZED", "Missing API key")
        if not key_value.startswith(API_KEY_PREFIX):
            raise AppError(401, "UNAUTHORIZED", "Invalid API key format")

        key_prefix = key_value[:18]
        candidates = db.scalars(select(ApiKey).where(ApiKey.key_prefix == key_prefix, ApiKey.revoked_at.is_(None))).all()
        api_key = next((candidate for candidate in candidates if verify_api_key_value(key_value, candidate.key_hash, settings)), None)
        if api_key is None:
            raise AppError(401, "UNAUTHORIZED", "Invalid API key")
        if required_scope not in api_key.scopes and "admin:*" not in api_key.scopes:
            raise AppError(403, "FORBIDDEN", f"API key is missing {required_scope} scope")
        api_key.last_used_at = utcnow()
        db.flush()
        return api_key

    return dependency


def make_admin_cookie(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    issued_at = str(int(time.time()))
    nonce = secrets.token_urlsafe(16)
    payload = f"{issued_at}.{nonce}"
    signature = hmac.new(settings.session_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def verify_admin_cookie(value: str | None, settings: Settings | None = None, max_age_seconds: int = 7 * 24 * 3600) -> bool:
    if not value:
        return False
    settings = settings or get_settings()
    parts = value.split(".")
    if len(parts) != 3:
        return False
    issued_at, nonce, signature = parts
    payload = f"{issued_at}.{nonce}"
    expected = hmac.new(settings.session_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return False
    try:
        age = int(time.time()) - int(issued_at)
    except ValueError:
        return False
    return 0 <= age <= max_age_seconds


def require_admin(request: Request, settings: Settings = Depends(get_settings)) -> bool:
    if not verify_admin_cookie(request.cookies.get(ADMIN_COOKIE_NAME), settings):
        raise AppError(401, "UNAUTHORIZED", "Admin login required")
    return True


def expires_from_default(settings: Settings | None = None) -> datetime | None:
    settings = settings or get_settings()
    if settings.default_ttl_days <= 0:
        return None
    return utcnow() + timedelta(days=settings.default_ttl_days)


def new_artifact_id() -> str:
    timestamp_ms = int(time.time() * 1000).to_bytes(6, "big")
    random_bytes = secrets.token_bytes(10)
    raw = timestamp_ms + random_bytes
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    number = int.from_bytes(raw, "big")
    chars = []
    for _ in range(26):
        chars.append(alphabet[number & 31])
        number >>= 5
    return "art_" + "".join(reversed(chars))


def request_hash(value: bytes | str | dict[str, Any]) -> str:
    if isinstance(value, bytes):
        payload = value
    elif isinstance(value, str):
        payload = value.encode("utf-8")
    else:
        import json

        payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def token_hash_matches(stored_hash: str | None, token: str | None) -> bool:
    if not stored_hash or not token:
        return False
    return constant_time_equal(stored_hash, secret_hash(token))


def public_token_for_path(token: str | None) -> str:
    if token:
        return token
    return "public"


def encode_text_token(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")
