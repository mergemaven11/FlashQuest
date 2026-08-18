"""Database and API models for FlashQuest’s study engine."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class CardBase(SQLModel):
    """Fields used when creating a user-owned study card."""

    word: str
    definition: str
    topic: str = "Custom"
    domain: str = "General"
    kind: str = "concept"


class CardCreate(CardBase):
    """Payload used to create a custom study card."""


class CardRead(CardBase):
    """Public card representation."""

    id: int
    created_at: datetime
    is_builtin: bool = False


class CardAdminRead(CardRead):
    """Card representation with spaced-repetition state."""

    bin: int
    status: str


class CardUpdate(SQLModel):
    """Fields a user may customize on a card."""

    word: Optional[str] = None
    definition: Optional[str] = None
    topic: Optional[str] = None
    domain: Optional[str] = None
    kind: Optional[str] = None


class Card(SQLModel, table=True):
    """A reusable study card that can belong to any topic or learning mode."""

    id: Optional[int] = Field(default=None, primary_key=True)
    word: str = Field(sa_type=sa.String)
    definition: str = Field(sa_type=sa.String)
    topic: str = Field(default="Custom", index=True, sa_type=sa.String)
    domain: str = Field(default="General", index=True, sa_type=sa.String)
    kind: str = Field(default="concept", index=True, sa_type=sa.String)
    is_builtin: bool = Field(default=False, index=True, sa_type=sa.Boolean)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=sa.DateTime(timezone=True),
    )


class UserCard(SQLModel, table=True):
    """Per-user spaced-repetition state for a card."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=1, index=True, sa_type=sa.Integer)
    card_id: int = Field(foreign_key="card.id", index=True, sa_type=sa.Integer)
    bin: int = Field(default=0, sa_type=sa.Integer)
    wrong_count: int = Field(default=0, sa_type=sa.Integer)
    next_review_at: Optional[datetime] = Field(
        default=None, sa_type=sa.DateTime(timezone=True)
    )
    status: str = Field(default="active", sa_type=sa.String)


class Review(SQLModel, table=True):
    """Audit record for one answer in the study loop."""

    id: Optional[int] = Field(default=None, primary_key=True)
    card_id: int = Field(foreign_key="card.id", sa_type=sa.Integer)
    user_id: Optional[int] = Field(default=1, index=True, sa_type=sa.Integer)
    result: str = Field(sa_type=sa.String)
    from_bin: int = Field(sa_type=sa.Integer)
    to_bin: int = Field(sa_type=sa.Integer)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=sa.DateTime(timezone=True),
    )


class CardStats(SQLModel):
    """Aggregated study stats for the default demo user."""

    total_cards: int
    active: int
    never: int
    hard_to_remember: int
    by_bin: Dict[int, int]
