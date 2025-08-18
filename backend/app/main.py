from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import cards, study
from .config import settings


def _allowed_origins() -> list[str]:
    """
    Build the list of allowed CORS origins.

    Returns:
        list[str]: Origins permitted to access this API from the browser.

    Notes:
        - Includes localhost dev ports by default.
        - You can extend via `ALLOWED_ORIGINS` env (comma-separated or JSON list).
    """
    # Default for local dev
    defaults = {"http://localhost:5173", "http://127.0.0.1:5173"}
    # If added ALLOWED_ORIGINS to Settings, merge it here; otherwise just return defaults.
    try:
        extra = set(getattr(settings, "ALLOWED_ORIGINS", []) or [])
    except Exception:
        extra = set()
    return list(defaults | extra)


app = FastAPI(title="Flashcards API")

# ---- CORS middleware ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----
app.include_router(cards.router)
app.include_router(study.router)


@app.get("/health")
def health() -> dict[str, bool]:
    """Simple health check endpoint."""
    return {"ok": True}
