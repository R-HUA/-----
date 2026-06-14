from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ArtifactKind = Literal[
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
]

Visibility = Literal["private", "token", "public"]


class SessionUpsertRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    title: str | None = None
    source: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArtifactJsonUploadRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    title: str | None = None
    description: str | None = None
    filename: str
    kind: ArtifactKind | None = None
    mime_type: str | None = Field(default=None, alias="mimeType")
    content: str
    visibility: Visibility = "token"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArtifactUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    visibility: Visibility | None = None
    trusted_html: bool | None = Field(default=None, alias="trustedHtml")
    metadata: dict[str, Any] | None = None


class SessionUpdateRequest(BaseModel):
    title: str | None = None
    source: str | None = None
    metadata: dict[str, Any] | None = None


class AdminLoginRequest(BaseModel):
    password: str


class ApiKeyCreateRequest(BaseModel):
    name: str
    scopes: list[str] = Field(default_factory=lambda: ["write:artifact"])


class CleanupRequest(BaseModel):
    older_than_days: int | None = Field(default=None, alias="olderThanDays")
    dry_run: bool = Field(default=False, alias="dryRun")


class ArtifactSummary(BaseModel):
    artifact_id: str = Field(alias="artifactId")
    session_id: str = Field(alias="sessionId")
    title: str
    filename: str
    kind: str
    mime_type: str = Field(alias="mimeType")
    size_bytes: int = Field(alias="sizeBytes")
    created_at: datetime = Field(alias="createdAt")
    view_url: str = Field(alias="viewUrl")


class ViewArtifact(BaseModel):
    artifact_id: str = Field(alias="artifactId")
    session_id: str = Field(alias="sessionId")
    title: str
    description: str | None = None
    filename: str
    kind: str
    mime_type: str = Field(alias="mimeType")
    size_bytes: int = Field(alias="sizeBytes")
    sha256: str
    created_at: datetime = Field(alias="createdAt")
    content_url: str = Field(alias="contentUrl")
    download_url: str = Field(alias="downloadUrl")
    trusted_html: bool = Field(alias="trustedHtml")
    entry_path: str | None = Field(default=None, alias="entryPath")
    siblings: list[ArtifactSummary]


class ViewSession(BaseModel):
    session_id: str = Field(alias="sessionId")
    title: str | None = None
    source: str | None = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    artifacts: list[ArtifactSummary]
