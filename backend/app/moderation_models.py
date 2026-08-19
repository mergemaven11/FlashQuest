"""Persistent moderation contracts for Quest Rooms.

Reports snapshot enough context for later human review. Blocks are user-scoped
visibility preferences. Audit rows record consequential moderation actions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from .models import utc_now

REPORT_KINDS = {"room", "message", "user"}
REPORT_STATUSES = {"open", "reviewed", "dismissed", "actioned"}
MODERATION_ACTIONS = {
    "member_removed",
    "report_reviewed",
    "report_dismissed",
    "report_actioned",
}


class UserBlock(SQLModel, table=True):
    """One-way user block controlling the blocker's chat visibility."""

    __tablename__ = "user_block"
    __table_args__ = (
        sa.UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_user_block_pair"),
        sa.CheckConstraint(
            "blocker_user_id <> blocked_user_id",
            name="ck_user_block_not_self",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    blocker_user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    blocked_user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))


class ModerationReport(SQLModel, table=True):
    """User report with immutable snapshots needed for later review."""

    __tablename__ = "moderation_report"
    __table_args__ = (
        sa.CheckConstraint(
            "kind IN ('room', 'message', 'user')",
            name="ck_moderation_report_kind",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'reviewed', 'dismissed', 'actioned')",
            name="ck_moderation_report_status",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    room_id: int = Field(foreign_key="study_room.id", index=True, sa_type=sa.Integer)
    kind: str = Field(index=True, sa_type=sa.String)
    message_id: Optional[int] = Field(
        default=None, foreign_key="room_message.id", index=True, sa_type=sa.Integer
    )
    target_user_id: Optional[int] = Field(
        default=None, foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    reason: str = Field(sa_type=sa.String)
    details: str = Field(default="", sa_column=sa.Column(sa.Text(), nullable=False))
    room_name_snapshot: str = Field(sa_type=sa.String)
    message_body_snapshot: Optional[str] = Field(
        default=None, sa_column=sa.Column(sa.Text(), nullable=True)
    )
    message_author_user_id: Optional[int] = Field(default=None, sa_type=sa.Integer)
    target_display_name_snapshot: Optional[str] = Field(default=None, sa_type=sa.String)
    status: str = Field(default="open", index=True, sa_type=sa.String)
    created_at: datetime = Field(
        default_factory=utc_now, index=True, sa_type=sa.DateTime(timezone=True)
    )
    reviewed_at: Optional[datetime] = Field(default=None, sa_type=sa.DateTime(timezone=True))
    reviewed_by_user_id: Optional[int] = Field(
        default=None, foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    review_note: str = Field(default="", sa_column=sa.Column(sa.Text(), nullable=False))


class ModerationAudit(SQLModel, table=True):
    """Append-only audit trail for host/moderator actions."""

    __tablename__ = "moderation_audit"
    __table_args__ = (
        sa.CheckConstraint(
            "action IN ('member_removed', 'report_reviewed', 'report_dismissed', 'report_actioned')",
            name="ck_moderation_audit_action",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    action: str = Field(index=True, sa_type=sa.String)
    actor_user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    room_id: Optional[int] = Field(
        default=None, foreign_key="study_room.id", index=True, sa_type=sa.Integer
    )
    target_user_id: Optional[int] = Field(
        default=None, foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    report_id: Optional[int] = Field(
        default=None, foreign_key="moderation_report.id", index=True, sa_type=sa.Integer
    )
    detail: str = Field(default="", sa_column=sa.Column(sa.Text(), nullable=False))
    created_at: datetime = Field(
        default_factory=utc_now, index=True, sa_type=sa.DateTime(timezone=True)
    )


class ReportCreate(SQLModel):
    kind: str
    message_id: Optional[int] = None
    target_user_id: Optional[int] = None
    reason: str
    details: str = ""


class ReportRead(SQLModel):
    id: int
    reporter_user_id: int
    room_id: int
    kind: str
    message_id: Optional[int] = None
    target_user_id: Optional[int] = None
    reason: str
    details: str
    room_name_snapshot: str
    message_body_snapshot: Optional[str] = None
    message_author_user_id: Optional[int] = None
    target_display_name_snapshot: Optional[str] = None
    status: str
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_user_id: Optional[int] = None
    review_note: str


class ReportReview(SQLModel):
    status: str
    note: str = ""


class BlockRead(SQLModel):
    user_id: int
    display_name: str
    created_at: datetime


class ModerationCapability(SQLModel):
    moderator: bool
