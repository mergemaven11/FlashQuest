"""add accounts decks and verification

Revision ID: c8a9d2e3f4b5
Revises: b7f8c1a2d3e4
Create Date: 2026-08-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8a9d2e3f4b5"
down_revision: Union[str, Sequence[str], None] = "b7f8c1a2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add verified accounts, owned decks, sessions, and email verification tokens."""
    op.create_table(
        "app_user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_app_user_email"),
    )
    op.create_index(op.f("ix_app_user_email"), "app_user", ["email"], unique=False)
    op.create_index(
        op.f("ix_app_user_is_verified"), "app_user", ["is_verified"], unique=False
    )

    op.create_table(
        "deck",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_deck_slug"),
    )
    op.create_index(op.f("ix_deck_owner_id"), "deck", ["owner_id"], unique=False)
    op.create_index(op.f("ix_deck_title"), "deck", ["title"], unique=False)
    op.create_index(op.f("ix_deck_slug"), "deck", ["slug"], unique=False)
    op.create_index(op.f("ix_deck_is_builtin"), "deck", ["is_builtin"], unique=False)

    op.create_table(
        "authsession",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_authsession_token_hash"),
    )
    op.create_index(
        op.f("ix_authsession_user_id"), "authsession", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_authsession_token_hash"), "authsession", ["token_hash"], unique=False
    )

    op.create_table(
        "emailverificationtoken",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_emailverificationtoken_token_hash"),
    )
    op.create_index(
        op.f("ix_emailverificationtoken_user_id"),
        "emailverificationtoken",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_emailverificationtoken_token_hash"),
        "emailverificationtoken",
        ["token_hash"],
        unique=False,
    )

    op.add_column("card", sa.Column("deck_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_card_deck_id", "card", "deck", ["deck_id"], ["id"])
    op.create_index(op.f("ix_card_deck_id"), "card", ["deck_id"], unique=False)

    # Reserve user id 0 for the anonymous public demo. Existing installs used 1.
    op.execute(sa.text("UPDATE usercard SET user_id = 0 WHERE user_id = 1"))
    op.execute(sa.text("UPDATE review SET user_id = 0 WHERE user_id = 1"))


def downgrade() -> None:
    """Remove account/deck schema and restore the legacy demo user id."""
    op.execute(sa.text("UPDATE usercard SET user_id = 1 WHERE user_id = 0"))
    op.execute(sa.text("UPDATE review SET user_id = 1 WHERE user_id = 0"))

    op.drop_index(op.f("ix_card_deck_id"), table_name="card")
    op.drop_constraint("fk_card_deck_id", "card", type_="foreignkey")
    op.drop_column("card", "deck_id")

    op.drop_index(op.f("ix_emailverificationtoken_token_hash"), table_name="emailverificationtoken")
    op.drop_index(op.f("ix_emailverificationtoken_user_id"), table_name="emailverificationtoken")
    op.drop_table("emailverificationtoken")

    op.drop_index(op.f("ix_authsession_token_hash"), table_name="authsession")
    op.drop_index(op.f("ix_authsession_user_id"), table_name="authsession")
    op.drop_table("authsession")

    op.drop_index(op.f("ix_deck_is_builtin"), table_name="deck")
    op.drop_index(op.f("ix_deck_slug"), table_name="deck")
    op.drop_index(op.f("ix_deck_title"), table_name="deck")
    op.drop_index(op.f("ix_deck_owner_id"), table_name="deck")
    op.drop_table("deck")

    op.drop_index(op.f("ix_app_user_is_verified"), table_name="app_user")
    op.drop_index(op.f("ix_app_user_email"), table_name="app_user")
    op.drop_table("app_user")
