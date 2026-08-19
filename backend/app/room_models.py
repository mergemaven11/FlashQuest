"""Persistent data contracts for deck-linked Quest Rooms.

Room membership and message history are durable PostgreSQL state. Realtime
presence intentionally lives outside these tables so heartbeats do not become a
write-amplification problem.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from .models import utc_now

ROOM_VISIBILITIES = {"public", "private", "invite_only"}
ROOM_STATUSES = {"open", "closed"}
ROOM_ROLES = {"host", "moderator", "member"}
ROOM_MEMBER_STATUSES = {"active", "left", "removed"}
ROOM_MESSAGE_KINDS = {"chat", "card", "system", "activity"}


class StudyRoom(SQLModel, table=True):
    """Deck-linked persistent container for social study and shared activities."""

    __tablename__ = "study_room"
    __table_args__ = (
        sa.CheckConstraint(
            "visibility IN ('public', 'private', 'invite_only')",
            name="ck_study_room_visibility",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'closed')",
            name="ck_study_room_status",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    host_user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    deck_id: int = Field(foreign_key="deck.id", index=True, sa_type=sa.Integer)
    name: str = Field(index=True, sa_type=sa.String)
    visibility: str = Field(default="private", index=True, sa_type=sa.String)
    status: str = Field(default="open", index=True, sa_type=sa.String)
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    closed_at: Optional[datetime] = Field(default=None, sa_type=sa.DateTime(timezone=True))


class RoomMember(SQLModel, table=True):
    """Persistent membership/role; a WebSocket connection is never membership."""

    __tablename__ = "room_member"
    __table_args__ = (
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_member_room_user"),
        sa.CheckConstraint(
            "role IN ('host', 'moderator', 'member')",
            name="ck_room_member_role",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'left', 'removed')",
            name="ck_room_member_status",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(
        foreign_key="study_room.id", index=True, sa_type=sa.Integer
    )
    user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    role: str = Field(default="member", index=True, sa_type=sa.String)
    status: str = Field(default="active", index=True, sa_type=sa.String)
    joined_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    last_seen_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    removed_at: Optional[datetime] = Field(default=None, sa_type=sa.DateTime(timezone=True))


class RoomMessage(SQLModel, table=True):
    """Durable room history independent of any one realtime process."""

    __tablename__ = "room_message"
    __table_args__ = (
        sa.CheckConstraint(
            "kind IN ('chat', 'card', 'system', 'activity')",
            name="ck_room_message_kind",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(
        foreign_key="study_room.id", index=True, sa_type=sa.Integer
    )
    user_id: int = Field(
        foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    kind: str = Field(default="chat", index=True, sa_type=sa.String)
    body: str = Field(sa_column=sa.Column(sa.Text(), nullable=False))
    card_id: Optional[int] = Field(
        default=None, foreign_key="card.id", index=True, sa_type=sa.Integer
    )
    created_at: datetime = Field(
        default_factory=utc_now, index=True, sa_type=sa.DateTime(timezone=True)
    )
    removed_at: Optional[datetime] = Field(default=None, sa_type=sa.DateTime(timezone=True))


class RoomCreate(SQLModel):
    """Verified-user request to create a deck-linked room."""

    deck_id: int
    name: str
    visibility: str = "private"


class RoomRead(SQLModel):
    """Permission-aware room summary returned by the REST foundation."""

    id: int
    host_user_id: int
    deck_id: int
    name: str
    visibility: str
    status: str
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    member_count: int = 0
    current_user_role: Optional[str] = None


class RoomMemberRead(SQLModel):
    id: int
    room_id: int
    user_id: int
    role: str
    status: str
    joined_at: datetime
    last_seen_at: datetime
