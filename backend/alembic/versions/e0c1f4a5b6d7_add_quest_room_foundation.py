"""add quest room foundation

Revision ID: e0c1f4a5b6d7
Revises: d9b0e3f4a5c6
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e0c1f4a5b6d7"
down_revision: Union[str, Sequence[str], None] = "d9b0e3f4a5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create persistent rooms, memberships, and message history."""
    op.create_table(
        "study_room",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("host_user_id", sa.Integer(), nullable=False),
        sa.Column("deck_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("visibility", sa.String(), nullable=False, server_default="private"),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "visibility IN ('public', 'private', 'invite_only')",
            name="ck_study_room_visibility",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'closed')",
            name="ck_study_room_status",
        ),
        sa.ForeignKeyConstraint(["deck_id"], ["deck.id"], name="fk_study_room_deck_id"),
        sa.ForeignKeyConstraint(
            ["host_user_id"], ["app_user.id"], name="fk_study_room_host_user_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_study_room_host_user_id"), "study_room", ["host_user_id"], unique=False)
    op.create_index(op.f("ix_study_room_deck_id"), "study_room", ["deck_id"], unique=False)
    op.create_index(op.f("ix_study_room_name"), "study_room", ["name"], unique=False)
    op.create_index(op.f("ix_study_room_visibility"), "study_room", ["visibility"], unique=False)
    op.create_index(op.f("ix_study_room_status"), "study_room", ["status"], unique=False)

    op.create_table(
        "room_member",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="member"),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('host', 'moderator', 'member')",
            name="ck_room_member_role",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'left', 'removed')",
            name="ck_room_member_status",
        ),
        sa.ForeignKeyConstraint(["room_id"], ["study_room.id"], name="fk_room_member_room_id"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], name="fk_room_member_user_id"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_member_room_user"),
    )
    op.create_index(op.f("ix_room_member_room_id"), "room_member", ["room_id"], unique=False)
    op.create_index(op.f("ix_room_member_user_id"), "room_member", ["user_id"], unique=False)
    op.create_index(op.f("ix_room_member_role"), "room_member", ["role"], unique=False)
    op.create_index(op.f("ix_room_member_status"), "room_member", ["status"], unique=False)

    op.create_table(
        "room_message",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="chat"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("card_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "kind IN ('chat', 'card', 'system', 'activity')",
            name="ck_room_message_kind",
        ),
        sa.ForeignKeyConstraint(["card_id"], ["card.id"], name="fk_room_message_card_id"),
        sa.ForeignKeyConstraint(["room_id"], ["study_room.id"], name="fk_room_message_room_id"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], name="fk_room_message_user_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_room_message_room_id"), "room_message", ["room_id"], unique=False)
    op.create_index(op.f("ix_room_message_user_id"), "room_message", ["user_id"], unique=False)
    op.create_index(op.f("ix_room_message_kind"), "room_message", ["kind"], unique=False)
    op.create_index(op.f("ix_room_message_card_id"), "room_message", ["card_id"], unique=False)
    op.create_index(op.f("ix_room_message_created_at"), "room_message", ["created_at"], unique=False)
    op.create_index(
        "ix_room_message_room_created_at",
        "room_message",
        ["room_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove Quest Room persistence tables."""
    op.drop_index("ix_room_message_room_created_at", table_name="room_message")
    op.drop_index(op.f("ix_room_message_created_at"), table_name="room_message")
    op.drop_index(op.f("ix_room_message_card_id"), table_name="room_message")
    op.drop_index(op.f("ix_room_message_kind"), table_name="room_message")
    op.drop_index(op.f("ix_room_message_user_id"), table_name="room_message")
    op.drop_index(op.f("ix_room_message_room_id"), table_name="room_message")
    op.drop_table("room_message")

    op.drop_index(op.f("ix_room_member_status"), table_name="room_member")
    op.drop_index(op.f("ix_room_member_role"), table_name="room_member")
    op.drop_index(op.f("ix_room_member_user_id"), table_name="room_member")
    op.drop_index(op.f("ix_room_member_room_id"), table_name="room_member")
    op.drop_table("room_member")

    op.drop_index(op.f("ix_study_room_status"), table_name="study_room")
    op.drop_index(op.f("ix_study_room_visibility"), table_name="study_room")
    op.drop_index(op.f("ix_study_room_name"), table_name="study_room")
    op.drop_index(op.f("ix_study_room_deck_id"), table_name="study_room")
    op.drop_index(op.f("ix_study_room_host_user_id"), table_name="study_room")
    op.drop_table("study_room")
