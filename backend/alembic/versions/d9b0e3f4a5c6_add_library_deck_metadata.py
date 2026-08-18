"""add library deck metadata

Revision ID: d9b0e3f4a5c6
Revises: c8a9d2e3f4b5
Create Date: 2026-08-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9b0e3f4a5c6"
down_revision: Union[str, Sequence[str], None] = "c8a9d2e3f4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add Library metadata while keeping existing custom decks private."""
    op.add_column(
        "deck",
        sa.Column("subject", sa.String(), nullable=False, server_default="General"),
    )
    op.add_column(
        "deck",
        sa.Column("difficulty", sa.String(), nullable=False, server_default="beginner"),
    )
    op.add_column(
        "deck",
        sa.Column("visibility", sa.String(), nullable=False, server_default="private"),
    )
    op.add_column(
        "deck",
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "deck",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "deck",
        sa.Column("source_deck_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "deck",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_foreign_key(
        "fk_deck_source_deck_id",
        "deck",
        "deck",
        ["source_deck_id"],
        ["id"],
    )

    # Existing rows keep their original creation time as the first update timestamp.
    op.execute(sa.text("UPDATE deck SET updated_at = created_at WHERE updated_at IS NULL"))

    # Built-in decks are the protected Official catalog. Existing user decks stay private.
    op.execute(
        sa.text(
            "UPDATE deck "
            "SET visibility = 'public', subject = 'Technology', "
            "difficulty = 'intermediate', published_at = created_at "
            "WHERE is_builtin = true"
        )
    )

    op.alter_column("deck", "updated_at", nullable=False)

    op.create_index(op.f("ix_deck_subject"), "deck", ["subject"], unique=False)
    op.create_index(op.f("ix_deck_difficulty"), "deck", ["difficulty"], unique=False)
    op.create_index(op.f("ix_deck_visibility"), "deck", ["visibility"], unique=False)
    op.create_index(op.f("ix_deck_published_at"), "deck", ["published_at"], unique=False)
    op.create_index(op.f("ix_deck_source_deck_id"), "deck", ["source_deck_id"], unique=False)


def downgrade() -> None:
    """Remove Library metadata from decks."""
    op.drop_index(op.f("ix_deck_source_deck_id"), table_name="deck")
    op.drop_index(op.f("ix_deck_published_at"), table_name="deck")
    op.drop_index(op.f("ix_deck_visibility"), table_name="deck")
    op.drop_index(op.f("ix_deck_difficulty"), table_name="deck")
    op.drop_index(op.f("ix_deck_subject"), table_name="deck")

    op.drop_constraint("fk_deck_source_deck_id", "deck", type_="foreignkey")
    op.drop_column("deck", "updated_at")
    op.drop_column("deck", "source_deck_id")
    op.drop_column("deck", "published_at")
    op.drop_column("deck", "tags")
    op.drop_column("deck", "visibility")
    op.drop_column("deck", "difficulty")
    op.drop_column("deck", "subject")
