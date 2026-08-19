"""add quest room moderation

Revision ID: g2e3b6c7d8f9
Revises: f1d2a5b6c7e8
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g2e3b6c7d8f9"
down_revision: Union[str, Sequence[str], None] = "f1d2a5b6c7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_block",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("blocker_user_id", sa.Integer(), nullable=False),
        sa.Column("blocked_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("blocker_user_id <> blocked_user_id", name="ck_user_block_not_self"),
        sa.ForeignKeyConstraint(["blocked_user_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["blocker_user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_block_pair"),
    )
    op.create_index(op.f("ix_user_block_blocker_user_id"), "user_block", ["blocker_user_id"], unique=False)
    op.create_index(op.f("ix_user_block_blocked_user_id"), "user_block", ["blocked_user_id"], unique=False)

    op.create_table(
        "moderation_report",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reporter_user_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("room_name_snapshot", sa.String(), nullable=False),
        sa.Column("message_body_snapshot", sa.Text(), nullable=True),
        sa.Column("message_author_user_id", sa.Integer(), nullable=True),
        sa.Column("target_display_name_snapshot", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('room', 'message', 'user')",
            name="ck_moderation_report_kind",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'reviewed', 'dismissed', 'actioned')",
            name="ck_moderation_report_status",
        ),
        sa.ForeignKeyConstraint(["message_id"], ["room_message.id"]),
        sa.ForeignKeyConstraint(["reporter_user_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["room_id"], ["study_room.id"]),
        sa.ForeignKeyConstraint(["target_user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "reporter_user_id",
        "room_id",
        "kind",
        "message_id",
        "target_user_id",
        "status",
        "created_at",
        "reviewed_by_user_id",
    ):
        op.create_index(op.f(f"ix_moderation_report_{column}"), "moderation_report", [column], unique=False)

    op.create_table(
        "moderation_audit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=True),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column("report_id", sa.Integer(), nullable=True),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "action IN ('member_removed', 'report_reviewed', 'report_dismissed', 'report_actioned')",
            name="ck_moderation_audit_action",
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["report_id"], ["moderation_report.id"]),
        sa.ForeignKeyConstraint(["room_id"], ["study_room.id"]),
        sa.ForeignKeyConstraint(["target_user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "action",
        "actor_user_id",
        "room_id",
        "target_user_id",
        "report_id",
        "created_at",
    ):
        op.create_index(op.f(f"ix_moderation_audit_{column}"), "moderation_audit", [column], unique=False)


def downgrade() -> None:
    for column in (
        "created_at",
        "report_id",
        "target_user_id",
        "room_id",
        "actor_user_id",
        "action",
    ):
        op.drop_index(op.f(f"ix_moderation_audit_{column}"), table_name="moderation_audit")
    op.drop_table("moderation_audit")

    for column in (
        "reviewed_by_user_id",
        "created_at",
        "status",
        "target_user_id",
        "message_id",
        "kind",
        "room_id",
        "reporter_user_id",
    ):
        op.drop_index(op.f(f"ix_moderation_report_{column}"), table_name="moderation_report")
    op.drop_table("moderation_report")

    op.drop_index(op.f("ix_user_block_blocked_user_id"), table_name="user_block")
    op.drop_index(op.f("ix_user_block_blocker_user_id"), table_name="user_block")
    op.drop_table("user_block")
