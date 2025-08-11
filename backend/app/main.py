from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db
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

@app.on_event("startup")
def on_startup():
    """
    Application startup event.

    Initializes the database schema before the API starts serving requests.
    """
    init_db()

# Register API routers
app.include_router(cards.router)
app.include_router(study.router)
