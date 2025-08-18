"""Database and Pydantic models for the flashcards app.

This module defines:
- SQLModel ORM tables (Card, UserCard, Review)
- Pydantic schemas for requests/responses (CardCreate, CardRead, CardAdminRead, CardUpdate, CardStats)

Notes:
    We explicitly set `sa_type=` on fields so Alembic autogenerate emits plain
    SQLAlchemy types (e.g., `sa.String`) instead of `AutoString`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Dict

import sqlalchemy as sa
from sqlmodel import SQLModel, Field


class CardBase(SQLModel):
    """Base fields shared by Card schemas.

    Attributes:
        word: The vocabulary term.
        definition: The meaning of the term.
    """

    word: str
    definition: str


class CardCreate(CardBase):
    """Payload schema used to create a new card.

    Inherits:
        CardBase
    """

    pass


class CardRead(CardBase):
    """Response schema for reading a card.

    Attributes:
        id: Primary key of the card.
        created_at: Timestamp when the card was created (UTC).
    """

    id: int
    created_at: datetime


class CardAdminRead(SQLModel):
    """Admin response schema with per-user study state.

    Attributes:
        id: Card id.
        word: The vocabulary term.
        definition: The meaning of the term.
        created_at: Card creation timestamp (UTC).
        bin: Current spaced-repetition bin for the default user (0–11).
        status: 'active', 'never', or 'hard_to_remember'.
    """

    id: int
    word: str
    definition: str
    created_at: datetime
    bin: int
    status: str


class CardUpdate(SQLModel):
    """PATCH/PUT schema for updating a card.

    Notes:
        All fields are optional to support partial updates.

    Attributes:
        word: Optional new word value.
        definition: Optional new definition value.
    """

    word: Optional[str] = None
    definition: Optional[str] = None


class Card(SQLModel, table=True):
    """ORM model representing a vocabulary flashcard.

    Attributes:
        id: Primary key.
        word: The vocabulary term.
        definition: The meaning of the term.
        created_at: UTC timestamp when the card was created.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    word: str = Field(sa_type=sa.String)
    definition: str = Field(sa_type=sa.String)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=sa.DateTime(timezone=True),
    )


class UserCard(SQLModel, table=True):
    """ORM model tracking a user's progress on a specific card.

    Attributes:
        id: Primary key.
        user_id: User identifier (MVP uses default=1).
        card_id: Foreign key to `Card.id`.
        bin: Current spaced-repetition bin (0–11).
        wrong_count: Lifetime count of incorrect answers.
        next_review_at: Next time the card becomes due (UTC).
        status: 'active', 'never', or 'hard_to_remember'.
    """

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
    """ORM model recording an individual study attempt.

    Attributes:
        id: Primary key.
        card_id: Foreign key to `Card.id`.
        user_id: User identifier (MVP uses default=1).
        result: 'correct' or 'wrong'.
        from_bin: Bin before the answer.
        to_bin: Bin after applying the answer.
        created_at: UTC timestamp when the review was recorded.
    """

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
    """Aggregated stats for admin dashboard.

    Attributes:
        total_cards: Number of cards tracked for the default user.
        active: Count of cards with status 'active'.
        never: Count of cards with status 'never' (last bin).
        hard_to_remember: Count of cards hidden due to many wrong answers.
        by_bin: A mapping of bin index (0..11) to count.
    """

    total_cards: int
    active: int
    never: int
    hard_to_remember: int
    by_bin: Dict[int, int]
