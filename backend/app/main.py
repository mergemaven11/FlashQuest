# backend/app/main.py
from __future__ import annotations


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .routers import cards, study
from .config import settings


def _allowed_origins() -> list[str]:
    """
    Build the list of allowed CORS origins.

    Returns:
        list[str]: Origins permitted to access this API from the browser.

    Notes:
        - Includes localhost dev ports by default.
        - Merges any `ALLOWED_ORIGINS` provided via environment (see Settings).
          You can pass JSON (recommended) or comma-separated values.
            e.g. '["https://your-site.netlify.app"]'
                 or 'https://your-site.netlify.app,https://another-site.com'
    """
    defaults = {"http://localhost:5173", "http://127.0.0.1:5173"}

    # Settings.ALLOWED_ORIGINS is a list[str]; if the env var is set as JSON,
    # pydantic will parse it. Comma-delimited fallback is handled in config.py.
    extra = set(getattr(settings, "ALLOWED_ORIGINS", []) or [])
    return list(defaults | extra)


app = FastAPI(
    title="Flashcards API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ---- CORS middleware ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,  # no cookies; set True if you need them
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----
app.include_router(cards.router)
app.include_router(study.router)


@app.get("/health")
def health() -> dict[str, bool]:
    """Simple health check endpoint used by Fly.io and the frontend."""
    return {"ok": True}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """
    Convenience redirect so visiting the root on Fly shows interactive docs.
    """
    return RedirectResponse(url="/docs", status_code=307)
