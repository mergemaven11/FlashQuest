"""add quest room invites

Revision ID: f1d2a5b6c7e8
Revises: e0c1f4a5b6d7
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1d2a5b6c7e8"
down_revision: Union[str, Sequence[str], None] = "e0c1f4a5b6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Persist hashed, expiring, revocable invite capabilities."""
    op.create_table(
        "room_invite",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["room_id"], ["study_room.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_room_invite_token_hash"),
    )
    op.create_index(op.f("ix_room_invite_room_id"), "room_invite", ["room_id"], unique=False)
    op.create_index(
        op.f("ix_room_invite_created_by_user_id"),
        "room_invite",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_room_invite_token_hash"),
        "room_invite",
        ["token_hash"],
        unique=False,
    )
    op.create_index(
        op.f("ix_room_invite_expires_at"),
        "room_invite",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove persistent room invite capabilities."""
    op.drop_index(op.f("ix_room_invite_expires_at"), table_name="room_invite")
    op.drop_index(op.f("ix_room_invite_token_hash"), table_name="room_invite")
    op.drop_index(op.f("ix_room_invite_created_by_user_id"), table_name="room_invite")
    op.drop_index(op.f("ix_room_invite_room_id"), table_name="room_invite")
    op.drop_table("room_invite")
