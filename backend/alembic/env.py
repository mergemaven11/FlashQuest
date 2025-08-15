# backend/alembic/env.py
from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
import importlib
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# Import app bits so metadata is populated and we can read the DB URL
from app import models  # noqa: F401
from app.config import settings

# --- mypy/Pylance-friendly import of alembic.context ---
if TYPE_CHECKING:
    # During type checking, treat `context` as Any so attribute access is fine.
    context = cast(Any, None)
else:
    # At runtime, import the actual submodule.
    context = cast(Any, importlib.import_module("alembic.context"))

# Alembic Config object, provides access to the .ini values
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

# Inject runtime DB URL (overrides alembic.ini default)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Target metadata for 'autogenerate'
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with a live DB connection)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
