from __future__ import annotations

import mimetypes
from pathlib import Path

VALID_KINDS = {
    "markdown",
    "html",
    "html-bundle",
    "image",
    "svg",
    "pdf",
    "json",
    "csv",
    "text",
    "junit",
    "archive",
    "binary",
}

TEXT_KINDS = {"markdown", "html", "json", "csv", "text", "junit"}


def infer_kind(filename: str, content_type: str | None = None, explicit_kind: str | None = None, sample: bytes | None = None) -> str:
    if explicit_kind:
        normalized = explicit_kind.strip().lower()
        if normalized in VALID_KINDS:
            return normalized

    suffix = Path(filename).suffix.lower()
    if suffix in {".md", ".markdown"}:
        return "markdown"
    if suffix in {".html", ".htm"}:
        return "html"
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}:
        return "image"
    if suffix == ".svg":
        return "svg"
    if suffix == ".pdf":
        return "pdf"
    if suffix == ".json":
        return "json"
    if suffix == ".csv":
        return "csv"
    if suffix == ".xml" and looks_like_junit(sample or b""):
        return "junit"
    if suffix in {".txt", ".log", ".out", ".err"}:
        return "text"
    if suffix in {".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz"}:
        return "archive"

    if content_type:
        base = content_type.split(";", 1)[0].strip().lower()
        if base == "text/markdown":
            return "markdown"
        if base == "text/html":
            return "html"
        if base.startswith("image/"):
            return "svg" if base == "image/svg+xml" else "image"
        if base == "application/pdf":
            return "pdf"
        if base in {"application/json", "text/json"}:
            return "json"
        if base == "text/csv":
            return "csv"
        if base.startswith("text/"):
            return "text"

    return "binary"


def infer_mime_type(filename: str, kind: str, content_type: str | None = None) -> str:
    if content_type and content_type != "application/octet-stream":
        return content_type
    by_kind = {
        "markdown": "text/markdown; charset=utf-8",
        "html": "text/html; charset=utf-8",
        "html-bundle": "text/html; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "csv": "text/csv; charset=utf-8",
        "text": "text/plain; charset=utf-8",
        "junit": "application/xml; charset=utf-8",
        "pdf": "application/pdf",
        "svg": "image/svg+xml",
        "archive": "application/octet-stream",
        "binary": "application/octet-stream",
    }
    if kind == "image":
        guessed, _ = mimetypes.guess_type(filename)
        return guessed or "application/octet-stream"
    return by_kind.get(kind, "application/octet-stream")


def looks_like_junit(sample: bytes) -> bool:
    text = sample[:4096].decode("utf-8", "ignore").lower()
    return "<testsuite" in text or "<testsuites" in text
