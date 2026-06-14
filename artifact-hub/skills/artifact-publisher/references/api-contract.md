# Artifact Hub API Contract

Base URL: `ARTIFACT_HUB_URL`

Authentication:

```http
Authorization: Bearer $ARTIFACT_HUB_API_KEY
```

Upload file:

```http
POST /api/v1/artifacts/upload
Content-Type: multipart/form-data
```

Fields: `sessionId`, `title`, `kind`, `visibility`, `metadata`, `file`.

Upload text:

```http
POST /api/v1/artifacts
Content-Type: application/json
```

Body:

```json
{
  "sessionId": "codex-session",
  "title": "Notes",
  "filename": "notes.md",
  "kind": "markdown",
  "mimeType": "text/markdown",
  "content": "# Notes",
  "visibility": "token",
  "metadata": {}
}
```

Upload directory bundle:

```http
POST /api/v1/artifacts/bundle
Content-Type: multipart/form-data
```

Fields: `sessionId`, `title`, `entryPath`, `visibility`, `metadata`, `file` where `file` is a zip.

Successful response:

```json
{
  "ok": true,
  "data": {
    "artifactId": "art_...",
    "sessionId": "codex-session",
    "kind": "markdown",
    "viewUrl": "http://127.0.0.1:8787/v/codex-session/art_...?t=...",
    "rawUrl": "http://127.0.0.1:8787/r/art_.../token/blob",
    "downloadUrl": "http://127.0.0.1:8787/download/art_...?t=...",
    "sessionUrl": "http://127.0.0.1:8787/v/codex-session?t=..."
  }
}
```

Error response:

```json
{
  "ok": false,
  "error": {
    "code": "UPLOAD_TOO_LARGE",
    "message": "File exceeds max upload size",
    "details": {}
  }
}
```
