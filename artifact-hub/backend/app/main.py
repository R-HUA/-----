from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .errors import AppError
from .routes import admin, artifacts, health, sessions, view


def create_app() -> FastAPI:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="Artifact Hub", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.public_base_url, "http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(artifacts.router)
    app.include_router(view.router)
    app.include_router(admin.router)

    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": exc.detail})

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc):
        dist = frontend_dist()
        if dist and (request.url.path.startswith("/v/") or request.url.path.startswith("/admin")):
            return FileResponse(dist / "index.html")
        return JSONResponse(status_code=404, content={"ok": False, "error": {"code": "NOT_FOUND", "message": "Not found", "details": {}}})

    dist = frontend_dist()
    if dist:
        assets = dist / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        def index():
            return FileResponse(dist / "index.html")

        @app.get("/v/{path:path}", include_in_schema=False)
        def view_spa(path: str):
            return FileResponse(dist / "index.html")

        @app.get("/admin/{path:path}", include_in_schema=False)
        def admin_spa(path: str):
            return FileResponse(dist / "index.html")

    return app


def frontend_dist() -> Path | None:
    candidate = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return candidate if (candidate / "index.html").exists() else None


app = create_app()
