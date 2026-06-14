#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import random
import string
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish artifacts to Artifact Hub.")
    sub = parser.add_subparsers(dest="command", required=True)

    file_parser = sub.add_parser("file")
    file_parser.add_argument("path")
    add_common(file_parser)
    file_parser.add_argument("--kind")

    text_parser = sub.add_parser("text")
    text_parser.add_argument("--filename", required=True)
    text_parser.add_argument("--kind", default="text")
    text_parser.add_argument("--stdin", action="store_true")
    text_parser.add_argument("--content")
    add_common(text_parser)

    dir_parser = sub.add_parser("dir")
    dir_parser.add_argument("path")
    dir_parser.add_argument("--entry", default="index.html")
    add_common(dir_parser)

    args = parser.parse_args()
    try:
        if args.command == "file":
            result = publish_file(args)
        elif args.command == "text":
            result = publish_text(args)
        else:
            result = publish_dir(args)
    except PublishError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(result["viewUrl"])
    return 0


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--session")
    parser.add_argument("--title")
    parser.add_argument("--visibility", default=os.getenv("ARTIFACT_HUB_DEFAULT_VISIBILITY", "token"))
    parser.add_argument("--json", action="store_true")


def publish_file(args: argparse.Namespace) -> dict:
    path = Path(args.path)
    if not path.is_file():
        raise PublishError(f"File does not exist: {path}")
    content = path.read_bytes()
    kind = args.kind or infer_kind(path.name, content)
    fields = {
        "sessionId": session_id(args.session),
        "title": args.title or path.name,
        "kind": kind,
        "visibility": args.visibility,
        "metadata": json.dumps({"tool": "artifact-publisher"}),
    }
    return request_multipart(
        "/api/v1/artifacts/upload",
        fields,
        "file",
        path.name,
        content,
        mimetypes.guess_type(path.name)[0] or "application/octet-stream",
    )


def publish_text(args: argparse.Namespace) -> dict:
    if args.stdin:
        content = sys.stdin.read()
    elif args.content is not None:
        content = args.content
    else:
        raise PublishError("Use --stdin or --content for text upload")
    payload = {
        "sessionId": session_id(args.session),
        "title": args.title or args.filename,
        "filename": args.filename,
        "kind": args.kind,
        "mimeType": mimetypes.guess_type(args.filename)[0] or "text/plain",
        "content": content,
        "visibility": args.visibility,
        "metadata": {"tool": "artifact-publisher"},
    }
    return request_json("/api/v1/artifacts", payload)


def publish_dir(args: argparse.Namespace) -> dict:
    directory = Path(args.path)
    if not directory.is_dir():
        raise PublishError(f"Directory does not exist: {directory}")
    if not (directory / args.entry).is_file():
        raise PublishError(f"Entry file does not exist: {args.entry}")
    with tempfile.NamedTemporaryFile(suffix=".zip") as temp:
        with zipfile.ZipFile(temp.name, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in directory.rglob("*"):
                if path.is_file():
                    archive.write(path, path.relative_to(directory).as_posix())
        content = Path(temp.name).read_bytes()
    fields = {
        "sessionId": session_id(args.session),
        "title": args.title or directory.name,
        "entryPath": args.entry,
        "visibility": args.visibility,
        "metadata": json.dumps({"tool": "artifact-publisher"}),
    }
    return request_multipart("/api/v1/artifacts/bundle", fields, "file", directory.name + ".zip", content, "application/zip")


def request_json(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    headers = auth_headers(idempotency_key(payload["sessionId"], payload["filename"], body))
    headers["Content-Type"] = "application/json"
    request = urllib.request.Request(base_url() + path, data=body, headers=headers, method="POST")
    return perform(request)


def request_multipart(path: str, fields: dict, file_field: str, filename: str, content: bytes, content_type: str) -> dict:
    boundary = "----artifact-publisher-" + hashlib.sha256(os.urandom(16)).hexdigest()
    body = multipart_body(boundary, fields, file_field, filename, content, content_type)
    headers = auth_headers(idempotency_key(fields["sessionId"], filename, content))
    headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    request = urllib.request.Request(base_url() + path, data=body, headers=headers, method="POST")
    return perform(request)


def perform(request: urllib.request.Request) -> dict:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if not payload.get("ok"):
                    raise PublishError(format_error(payload.get("error", {})))
                data = payload["data"]
                return {
                    "ok": True,
                    "artifactId": data["artifactId"],
                    "sessionId": data["sessionId"],
                    "viewUrl": data["viewUrl"],
                    "sessionUrl": data["sessionUrl"],
                }
        except urllib.error.HTTPError as exc:
            message = exc.read().decode("utf-8", "replace")
            raise PublishError(f"Upload failed with HTTP {exc.code}: {message}") from exc
        except urllib.error.URLError as exc:
            last_error = exc
            time.sleep(0.5 * (2**attempt))
    raise PublishError(f"Upload failed after retries: {last_error}")


def multipart_body(boundary: str, fields: dict, file_field: str, filename: str, content: bytes, content_type: str) -> bytes:
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        chunks.append(str(value).encode())
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}\r\n".encode())
    chunks.append(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode())
    chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode())
    chunks.append(content)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks)


def auth_headers(idem: str) -> dict[str, str]:
    key = os.getenv("ARTIFACT_HUB_API_KEY")
    if not key:
        raise PublishError("ARTIFACT_HUB_API_KEY is required")
    return {
        "Authorization": f"Bearer {key}",
        "Idempotency-Key": idem,
        "X-Agent-Name": "codex",
        "X-Agent-Version": "unknown",
    }


def base_url() -> str:
    value = os.getenv("ARTIFACT_HUB_URL")
    if not value:
        raise PublishError("ARTIFACT_HUB_URL is required")
    return value.rstrip("/")


def session_id(value: str | None) -> str:
    if value:
        return value
    if os.getenv("ARTIFACT_HUB_SESSION_ID"):
        return os.environ["ARTIFACT_HUB_SESSION_ID"]
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return time.strftime("agent-%Y%m%d-%H%M%S-") + suffix


def idempotency_key(session: str, filename: str, content: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(session.encode())
    digest.update(b"\0")
    digest.update(filename.encode())
    digest.update(b"\0")
    digest.update(hashlib.sha256(content).hexdigest().encode())
    return digest.hexdigest()


def infer_kind(filename: str, content: bytes) -> str:
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
    if suffix == ".xml" and (b"<testsuite" in content[:4096].lower() or b"<testsuites" in content[:4096].lower()):
        return "junit"
    if suffix in {".txt", ".log", ".out", ".err"}:
        return "text"
    if suffix in {".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz"}:
        return "archive"
    return "binary"


def format_error(error: dict) -> str:
    code = error.get("code", "UPLOAD_FAILED")
    message = error.get("message", "Upload failed")
    return f"{code}: {message}"


class PublishError(Exception):
    pass


if __name__ == "__main__":
    raise SystemExit(main())
