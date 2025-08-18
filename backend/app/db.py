"""Database session and initialization utilities."""

from __future__ import annotations

from typing import Iterator

from sqlmodel import create_engine, Session

from .config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)


def init_db() -> None:
    """Initialize core database state.

    This function is intentionally minimal because we manage schema via Alembic.
    Keep this around for one-time bootstrap tasks if needed later (e.g., seeds).
    """
    # Alembic handles schema creation/migrations. Nothing to do here.
    return None


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a SQLModel `Session`.

    Yields:
        Session: An open database session tied to the current request.
    """
    with Session(engine) as session:
        yield session
