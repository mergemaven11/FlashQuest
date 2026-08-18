"""FastAPI application entry point and operational endpoints."""

from __future__ import annotations

import json
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from .config import settings
from .db import get_session
from .routers import auth, cards, decks, study


def _allowed_origins() -> list[str]:
    """Build the browser CORS allow-list from defaults and environment config."""
    defaults = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://flaskquest.netlify.app",
    }
    raw = (settings.ALLOWED_ORIGINS or "").strip()
    if not raw:
        return sorted(defaults)

    try:
        parsed = json.loads(raw) if raw.startswith("[") else None
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, list):
        extra = {str(origin).strip() for origin in parsed if str(origin).strip()}
    else:
        extra = {origin.strip() for origin in raw.split(",") if origin.strip()}
    return sorted(defaults | extra)


app = FastAPI(
    title="FlashQuest API",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Attach a request id and server timing header to every HTTP response."""
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    started = perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = f"{(perf_counter() - started) * 1000:.2f}"
    return response


app.include_router(auth.router)
app.include_router(decks.router)
app.include_router(cards.router)
app.include_router(study.router)


@app.get("/health")
def health() -> dict[str, bool]:
    """Backwards-compatible lightweight liveness check."""
    return {"ok": True}


@app.get("/health/live")
def liveness() -> dict[str, str | bool]:
    """Kubernetes/container-style liveness endpoint with service metadata."""
    return {
        "ok": True,
        "service": "flashquest-api",
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
    }


@app.get("/health/ready")
def readiness(session: Session = Depends(get_session)) -> dict[str, str | bool]:
    """Readiness check that verifies the API can execute a database query."""
    try:
        session.exec(text("SELECT 1")).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {
        "ok": True,
        "database": "ready",
        "service": "flashquest-api",
        "version": settings.APP_VERSION,
    }


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Redirect the API root to interactive OpenAPI documentation."""
    return RedirectResponse(url="/docs", status_code=307)
