from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import cards, study

app = FastAPI(title="Flashcards API - Tobias Scott")

# Enable CORS for all origins (SPA compatibility)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Alembic now owns the schema.
# @app.on_event("startup")
# def on_startup():
#     """
#     Application startup event.

#     Initializes the database schema before the API starts serving requests.
#     """
#     init_db()


@app.get("/health")
def health():
    """Simple healthcheck for Docker healthcheck."""
    return {"ok": True}


# Register API routers
app.include_router(cards.router)
app.include_router(study.router)
