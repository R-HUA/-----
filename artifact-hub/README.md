# Artifact Hub

Local/self-hosted artifact upload and preview service for AI agents.

## Components

- `backend/`: FastAPI, PostgreSQL metadata, local artifact storage, Typer CLI.
- `frontend/`: React/Vite viewer and admin console.
- `skills/artifact-publisher/`: Codex skill wrapper for uploads.

## Local configuration

Create `backend/.env` from `backend/.env.example` and set `DATABASE_URL`,
`ARTIFACT_HUB_ADMIN_PASSWORD`, and `ARTIFACT_HUB_SESSION_SECRET`.

Do not commit real database passwords or API keys.

## Run

Backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[test]"
.venv/bin/alembic upgrade head
.venv/bin/artifact-hub api-key create codex-local --scope write:artifact --scope read:artifact
.venv/bin/artifact-hub serve
```

Frontend:

```bash
cd frontend
npm install
npm run build
```

After `frontend/dist` exists, the FastAPI backend serves the UI from
`http://127.0.0.1:8787`.

Skill:

```bash
export ARTIFACT_HUB_URL=http://127.0.0.1:8787
export ARTIFACT_HUB_API_KEY=ahk_live_...
python skills/artifact-publisher/scripts/publish.py file ./report.md --session demo --json
```
