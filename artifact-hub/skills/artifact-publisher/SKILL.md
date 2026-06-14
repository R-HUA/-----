---
name: artifact-publisher
description: Publish generated artifacts to Artifact Hub and return browser-viewable URLs. Use when Codex or another agent creates files, reports, Markdown, HTML, images, logs, or build directories that the user should inspect in a browser, especially when the agent runs remotely and direct file viewing is inconvenient.
---

# Artifact Publisher

Use this skill after creating an artifact that should be viewed in a browser.

## Configuration

Require:

- `ARTIFACT_HUB_URL`
- `ARTIFACT_HUB_API_KEY`

Optional:

- `ARTIFACT_HUB_SESSION_ID`
- `ARTIFACT_HUB_DEFAULT_VISIBILITY`, default `token`

## Session ID

Choose the session in this order:

1. Explicit user-provided or command `--session`.
2. `ARTIFACT_HUB_SESSION_ID`.
3. Agent conversation/session id if available.
4. Generate `agent-YYYYMMDD-HHMMSS-<random6>`.

Reuse the same session id for all uploads in one user task.

## Commands

Upload a file:

```bash
python scripts/publish.py file ./report.md --session "$ARTIFACT_HUB_SESSION_ID" --title "Report" --json
```

Upload text from stdin:

```bash
python scripts/publish.py text --filename notes.md --kind markdown --session "$ARTIFACT_HUB_SESSION_ID" --stdin --json
```

Upload a directory with an HTML entry:

```bash
python scripts/publish.py dir ./dist --entry index.html --session "$ARTIFACT_HUB_SESSION_ID" --title "Preview" --json
```

## Result Handling

On success, return `viewUrl` to the user. For multiple uploads, also return `sessionUrl`.

Do not reveal API keys, admin passwords, storage paths, or token hashes.

For API debugging or changing the script, read `references/api-contract.md`.
