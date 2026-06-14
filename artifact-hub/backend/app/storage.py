from __future__ import annotations

import json
import mimetypes
import os
import shutil
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath

from .config import Settings, get_settings
from .errors import AppError


@dataclass(frozen=True)
class StoredObject:
    relative_path: str
    absolute_path: Path


def object_root(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    root = settings.data_dir / "objects"
    root.mkdir(parents=True, exist_ok=True)
    return root


def artifact_dir(artifact_id: str, now: datetime, settings: Settings | None = None) -> Path:
    return object_root(settings) / f"{now.year:04d}" / f"{now.month:02d}" / artifact_id


def relative_to_objects(path: Path, settings: Settings | None = None) -> str:
    return path.relative_to(object_root(settings)).as_posix()


def absolute_from_relative(relative_path: str, settings: Settings | None = None) -> Path:
    root = object_root(settings).resolve()
    absolute = (root / relative_path).resolve()
    if not absolute.is_relative_to(root):
        raise AppError(400, "INVALID_REQUEST", "Invalid storage path")
    return absolute


def save_blob(artifact_id: str, content: bytes, now: datetime, metadata: dict, settings: Settings | None = None) -> StoredObject:
    settings = settings or get_settings()
    if len(content) > settings.max_upload_bytes:
        raise AppError(413, "UPLOAD_TOO_LARGE", "File exceeds max upload size", {"maxUploadMb": settings.max_upload_mb})
    directory = artifact_dir(artifact_id, now, settings)
    directory.mkdir(parents=True, exist_ok=True)
    blob_path = directory / "blob"
    blob_path.write_bytes(content)
    (directory / "meta.json").write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    return StoredObject(relative_path=relative_to_objects(blob_path, settings), absolute_path=blob_path)


def save_bundle_zip(
    artifact_id: str,
    zip_content: bytes,
    now: datetime,
    entry_path: str,
    metadata: dict,
    settings: Settings | None = None,
) -> StoredObject:
    settings = settings or get_settings()
    if len(zip_content) > settings.max_upload_bytes:
        raise AppError(413, "UPLOAD_TOO_LARGE", "Zip file exceeds max upload size", {"maxUploadMb": settings.max_upload_mb})

    directory = artifact_dir(artifact_id, now, settings)
    if directory.exists():
        shutil.rmtree(directory)
    bundle_dir = directory / "bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)

    zip_path = directory / "upload.zip"
    zip_path.write_bytes(zip_content)
    extracted_total = 0
    file_count = 0

    try:
        with zipfile.ZipFile(zip_path) as archive:
            for info in archive.infolist():
                normalized = normalize_bundle_path(info.filename)
                if not normalized:
                    continue
                is_symlink = (info.external_attr >> 16) & 0o170000 == 0o120000
                if is_symlink:
                    raise AppError(400, "BUNDLE_INVALID", "Bundle contains symlink entries")
                if info.is_dir():
                    continue
                file_count += 1
                if file_count > settings.max_bundle_files:
                    raise AppError(413, "BUNDLE_TOO_LARGE", "Bundle contains too many files", {"maxBundleFiles": settings.max_bundle_files})
                extracted_total += info.file_size
                if extracted_total > settings.max_bundle_unzipped_bytes:
                    raise AppError(
                        413,
                        "BUNDLE_TOO_LARGE",
                        "Bundle exceeds uncompressed size limit",
                        {"maxBundleUnzippedMb": settings.max_bundle_unzipped_mb},
                    )
                target = (bundle_dir / normalized).resolve()
                if not target.is_relative_to(bundle_dir.resolve()):
                    raise AppError(400, "BUNDLE_INVALID", "Bundle path escapes extraction directory")
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, target.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
    except zipfile.BadZipFile as exc:
        raise AppError(400, "BUNDLE_INVALID", "Bundle upload must be a valid zip file") from exc
    finally:
        zip_path.unlink(missing_ok=True)

    normalized_entry = normalize_bundle_path(entry_path)
    if not normalized_entry or not (bundle_dir / normalized_entry).is_file():
        raise AppError(400, "BUNDLE_INVALID", "entryPath does not exist in bundle")

    (directory / "meta.json").write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    return StoredObject(relative_path=relative_to_objects(bundle_dir, settings), absolute_path=bundle_dir)


def normalize_bundle_path(path: str) -> str:
    path = path.replace("\\", "/")
    if path.startswith("/"):
        raise AppError(400, "BUNDLE_INVALID", f"Invalid bundle path: {path}")
    path = path.strip("/")
    if not path:
        return ""
    pure = PurePosixPath(path)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
        raise AppError(400, "BUNDLE_INVALID", f"Invalid bundle path: {path}")
    return pure.as_posix()


def resolve_bundle_file(bundle_root: Path, requested_path: str, entry_path: str | None) -> Path:
    normalized = normalize_bundle_path(requested_path or entry_path or "index.html")
    candidate = (bundle_root / normalized).resolve()
    bundle_root_resolved = bundle_root.resolve()
    if candidate.is_relative_to(bundle_root_resolved) and candidate.is_file():
        return candidate

    for fallback in ("200.html", "404.html", entry_path or "index.html"):
        normalized_fallback = normalize_bundle_path(fallback)
        fallback_candidate = (bundle_root / normalized_fallback).resolve()
        if fallback_candidate.is_relative_to(bundle_root_resolved) and fallback_candidate.is_file():
            return fallback_candidate

    raise AppError(404, "NOT_FOUND", "Bundle file not found")


def content_type_for_path(path: Path, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed:
        if guessed.startswith("text/") or guessed in {"application/javascript", "application/json", "image/svg+xml"}:
            return f"{guessed}; charset=utf-8"
        return guessed
    return fallback


def remove_artifact_storage(relative_path: str, settings: Settings | None = None) -> None:
    absolute = absolute_from_relative(relative_path, settings)
    target = absolute.parent if absolute.name in {"blob", "bundle"} else absolute
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
    else:
        target.unlink(missing_ok=True)
        parent = target.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()


def dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for root, _, files in os.walk(path):
        for filename in files:
            total += (Path(root) / filename).stat().st_size
    return total
