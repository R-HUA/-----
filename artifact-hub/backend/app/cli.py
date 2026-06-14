from __future__ import annotations

import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

import httpx
import typer
import uvicorn

from .artifact_kind import infer_kind
from .config import get_settings
from .db import SessionLocal
from .models import ApiKey
from .security import create_api_key, request_hash, sha256_bytes, utcnow

cli = typer.Typer(help="Artifact Hub service and upload CLI.")
db_cli = typer.Typer(help="Database commands.")
api_key_cli = typer.Typer(help="API key commands.")
cli.add_typer(db_cli, name="db")
cli.add_typer(api_key_cli, name="api-key")


@cli.command()
def serve(
    host: str | None = typer.Option(None, "--host"),
    port: int | None = typer.Option(None, "--port"),
):
    settings = get_settings()
    uvicorn.run("app.main:app", host=host or settings.host, port=port or settings.port, reload=False)


@db_cli.command("upgrade")
def db_upgrade():
    subprocess.run(["alembic", "upgrade", "head"], cwd=Path(__file__).resolve().parents[1], check=True)


@api_key_cli.command("create")
def api_key_create(
    name: str,
    scope: list[str] = typer.Option(["write:artifact"], "--scope"),
    json_output: bool = typer.Option(False, "--json"),
):
    settings = get_settings()
    key_value, key_prefix, key_hash = create_api_key(name, scope, settings)
    with SessionLocal() as session:
        api_key = ApiKey(name=name, key_prefix=key_prefix, key_hash=key_hash, scopes=scope, created_at=utcnow())
        session.add(api_key)
        session.commit()
        key_id = str(api_key.id)
    payload = {"id": key_id, "key": key_value, "keyPrefix": key_prefix, "scopes": scope}
    typer.echo(json.dumps(payload, indent=2) if json_output else key_value)


def server_url(value: str | None = None) -> str:
    return (value or os.getenv("ARTIFACT_HUB_URL") or get_settings().public_base_url).rstrip("/")


def api_key(value: str | None = None) -> str:
    resolved = value or os.getenv("ARTIFACT_HUB_API_KEY")
    if not resolved:
        raise typer.BadParameter("Set ARTIFACT_HUB_API_KEY or pass --api-key")
    return resolved


def print_upload_response(response: httpx.Response, json_output: bool) -> None:
    response.raise_for_status()
    payload = response.json()
    if not payload.get("ok"):
        raise typer.ClickException(json.dumps(payload.get("error", payload), indent=2))
    data = payload["data"]
    typer.echo(json.dumps(data, indent=2) if json_output else data["viewUrl"])


@cli.command()
def upload(
    file: Path,
    session: str = typer.Option(..., "--session"),
    title: str | None = typer.Option(None, "--title"),
    kind: str | None = typer.Option(None, "--kind"),
    visibility: str = typer.Option("token", "--visibility"),
    server: str | None = typer.Option(None, "--server"),
    key: str | None = typer.Option(None, "--api-key"),
    json_output: bool = typer.Option(False, "--json"),
):
    content = file.read_bytes()
    inferred_kind = kind or infer_kind(file.name, sample=content[:4096])
    idem = request_hash({"sessionId": session, "filename": file.name, "contentSha256": sha256_bytes(content), "kind": inferred_kind})
    with httpx.Client(timeout=60) as client:
        with file.open("rb") as handle:
            response = client.post(
                f"{server_url(server)}/api/v1/artifacts/upload",
                headers={"Authorization": f"Bearer {api_key(key)}", "Idempotency-Key": idem},
                data={"sessionId": session, "title": title or file.name, "kind": inferred_kind, "visibility": visibility, "metadata": "{}"},
                files={"file": (file.name, handle)},
            )
    print_upload_response(response, json_output)


@cli.command("upload-dir")
def upload_dir(
    directory: Path,
    entry: str = typer.Option("index.html", "--entry"),
    session: str = typer.Option(..., "--session"),
    title: str | None = typer.Option(None, "--title"),
    visibility: str = typer.Option("token", "--visibility"),
    server: str | None = typer.Option(None, "--server"),
    key: str | None = typer.Option(None, "--api-key"),
    json_output: bool = typer.Option(False, "--json"),
):
    if not directory.is_dir():
        raise typer.BadParameter("directory must be a directory")
    if not (directory / entry).is_file():
        raise typer.BadParameter(f"entry file does not exist: {entry}")
    with tempfile.NamedTemporaryFile(suffix=".zip") as temp:
        with zipfile.ZipFile(temp.name, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in directory.rglob("*"):
                if path.is_file():
                    archive.write(path, path.relative_to(directory).as_posix())
        content = Path(temp.name).read_bytes()
        idem = request_hash({"sessionId": session, "filename": directory.name + ".zip", "contentSha256": sha256_bytes(content), "entryPath": entry})
        with httpx.Client(timeout=120) as client:
            with open(temp.name, "rb") as handle:
                response = client.post(
                    f"{server_url(server)}/api/v1/artifacts/bundle",
                    headers={"Authorization": f"Bearer {api_key(key)}", "Idempotency-Key": idem},
                    data={"sessionId": session, "title": title or directory.name, "entryPath": entry, "visibility": visibility, "metadata": "{}"},
                    files={"file": (directory.name + ".zip", handle, "application/zip")},
                )
    print_upload_response(response, json_output)


@cli.command("list")
def list_session(
    session: str = typer.Option(..., "--session"),
    token: str | None = typer.Option(None, "--token"),
    server: str | None = typer.Option(None, "--server"),
    json_output: bool = typer.Option(False, "--json"),
):
    params = {"t": token} if token else None
    response = httpx.get(f"{server_url(server)}/api/v1/view/sessions/{session}", params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    typer.echo(json.dumps(payload["data"], indent=2) if json_output else "\n".join(item["viewUrl"] for item in payload["data"]["artifacts"]))


@cli.command()
def cleanup(
    older_than: int = typer.Option(..., "--older-than-days"),
    server: str | None = typer.Option(None, "--server"),
    admin_password: str | None = typer.Option(None, "--admin-password"),
):
    password = admin_password or os.getenv("ARTIFACT_HUB_ADMIN_PASSWORD")
    if not password:
        raise typer.BadParameter("Set ARTIFACT_HUB_ADMIN_PASSWORD or pass --admin-password")
    with httpx.Client(timeout=60) as client:
        login_response = client.post(f"{server_url(server)}/api/v1/admin/login", json={"password": password})
        login_response.raise_for_status()
        response = client.post(f"{server_url(server)}/api/v1/admin/cleanup", json={"olderThanDays": older_than})
        response.raise_for_status()
        typer.echo(json.dumps(response.json()["data"], indent=2))
