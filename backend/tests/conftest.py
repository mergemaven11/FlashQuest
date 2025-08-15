# tests/conftest.py
"""Pytest fixtures for an in-memory FastAPI test app with SQLite."""
import sys
from pathlib import Path
import importlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine, Session

# --- Make project root importable (parent of tests/) ---
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# --- Import your FastAPI app ---
from app.main import app  # noqa: E402

# --- Find the get_session dependency your routes use ---
_get_session = None
for modname in [
    "app.dependencies",
    "app.database",
    "app.db",
    "app.core.db",
    "app.db.session",
]:
    try:
        mod = importlib.import_module(modname)
        if hasattr(mod, "get_session"):
            _get_session = getattr(mod, "get_session")
            break
    except ModuleNotFoundError:
        continue

if _get_session is None:
    raise ImportError(
        "Could not find a `get_session` function. "
        "Add it to one of: app/dependencies.py, app/database.py, app/db.py "
        "or update tests/conftest.py to import it from the right place."
    )

# --- Thread-safe in-memory SQLite for tests (single shared connection) ---
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


# --- Recreate schema for every test to guarantee isolation ---
@pytest.fixture(autouse=True)
def _clean_db():
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    yield
    # Optionally drop again:
    # SQLModel.metadata.drop_all(engine)


# --- Provide a single Session per test (shared with the app) ---
@pytest.fixture()
def sqlite_session():
    with Session(engine) as session:
        yield session  # session closes on context exit


# --- TestClient that uses the SAME session as the sqlite_session fixture ---
@pytest.fixture()
def client(sqlite_session: Session):
    def _override_get_session():
        # Yield the *same* session instance so API and test see the same state
        yield sqlite_session

    app.dependency_overrides[_get_session] = _override_get_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
