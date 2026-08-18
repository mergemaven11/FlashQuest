"""Database and API models for FlashQuest's reusable study engine."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional

import sqlalchemy as sa
from pydantic import EmailStr
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    """A FlashQuest account. Email must be verified before deck creation."""

    __tablename__ = "app_user"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, sa_type=sa.String)
    display_name: str = Field(sa_type=sa.String)
    password_hash: str = Field(sa_type=sa.String)
    is_verified: bool = Field(default=False, index=True, sa_type=sa.Boolean)
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))


class UserRead(SQLModel):
    id: int
    email: EmailStr
    display_name: str
    is_verified: bool


class SignupRequest(SQLModel):
    display_name: str
    email: EmailStr
    password: str


class LoginRequest(SQLModel):
    email: EmailStr
    password: str


class AuthSession(SQLModel, table=True):
    """Hashed opaque bearer session. Raw tokens are never stored."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True, sa_type=sa.Integer)
    token_hash: str = Field(index=True, sa_type=sa.String)
    expires_at: datetime = Field(sa_type=sa.DateTime(timezone=True))
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    revoked_at: Optional[datetime] = Field(default=None, sa_type=sa.DateTime(timezone=True))


class EmailVerificationToken(SQLModel, table=True):
    """One-time hashed token used to verify an account email address."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True, sa_type=sa.Integer)
    token_hash: str = Field(index=True, sa_type=sa.String)
    expires_at: datetime = Field(sa_type=sa.DateTime(timezone=True))
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    used_at: Optional[datetime] = Field(default=None, sa_type=sa.DateTime(timezone=True))


class DeckBase(SQLModel):
    title: str
    description: str = ""


class DeckCreate(DeckBase):
    """Payload for a verified user to create a custom deck."""

    subject: str = "General"
    difficulty: str = "beginner"
    tags: list[str] = Field(default_factory=list)


class DeckUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[list[str]] = None


class DeckRead(DeckBase):
    id: int
    slug: str
    is_builtin: bool
    is_official: bool = False
    owner_id: Optional[int]
    creator_display_name: Optional[str] = None
    subject: str
    difficulty: str
    visibility: str
    tags: list[str]
    published_at: Optional[datetime] = None
    source_deck_id: Optional[int] = None
    card_count: int = 0
    created_at: datetime
    updated_at: datetime


class DeckPage(SQLModel):
    """Stable paginated response for public Library discovery."""

    items: list[DeckRead]
    total: int
    page: int
    page_size: int


class Deck(SQLModel, table=True):
    """A topic pack that can stay private or become a Library deck."""

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: Optional[int] = Field(
        default=None, foreign_key="app_user.id", index=True, sa_type=sa.Integer
    )
    title: str = Field(index=True, sa_type=sa.String)
    slug: str = Field(index=True, sa_type=sa.String)
    description: str = Field(default="", sa_type=sa.String)
    is_builtin: bool = Field(default=False, index=True, sa_type=sa.Boolean)
    subject: str = Field(default="General", index=True, sa_type=sa.String)
    difficulty: str = Field(default="beginner", index=True, sa_type=sa.String)
    visibility: str = Field(default="private", index=True, sa_type=sa.String)
    tags: list[str] = Field(
        default_factory=list,
        sa_column=sa.Column(sa.JSON, nullable=False),
    )
    published_at: Optional[datetime] = Field(
        default=None, index=True, sa_type=sa.DateTime(timezone=True)
    )
    source_deck_id: Optional[int] = Field(
        default=None, foreign_key="deck.id", index=True, sa_type=sa.Integer
    )
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))


class CardBase(SQLModel):
    """Fields shared by card create/read models."""

    word: str
    definition: str
    domain: str = "General"
    kind: str = "concept"


class CardCreate(CardBase):
    """Payload used to create a card inside an owned deck."""

    deck_id: int


class CardRead(CardBase):
    """Public card representation."""

    id: int
    deck_id: Optional[int] = None
    topic: str = "Custom"
    created_at: datetime
    is_builtin: bool = False


class CardAdminRead(CardRead):
    """Card representation with spaced-repetition state."""

    bin: int
    status: str


class CardUpdate(SQLModel):
    """Fields a user may customize on an owned card."""

    word: Optional[str] = None
    definition: Optional[str] = None
    domain: Optional[str] = None
    kind: Optional[str] = None


class Card(SQLModel, table=True):
    """A study card belonging to a built-in or user-owned deck."""

    id: Optional[int] = Field(default=None, primary_key=True)
    deck_id: Optional[int] = Field(
        default=None, foreign_key="deck.id", index=True, sa_type=sa.Integer
    )
    word: str = Field(sa_type=sa.String)
    definition: str = Field(sa_type=sa.String)
    # `topic` remains denormalized for backwards-compatible exports and diagnostics.
    topic: str = Field(default="Custom", index=True, sa_type=sa.String)
    domain: str = Field(default="General", index=True, sa_type=sa.String)
    kind: str = Field(default="concept", index=True, sa_type=sa.String)
    is_builtin: bool = Field(default=False, index=True, sa_type=sa.Boolean)
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))


class UserCard(SQLModel, table=True):
    """Per-user spaced-repetition state for a card.

    User id 0 is reserved for the anonymous public demo. Authenticated users start at 1.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=0, index=True, sa_type=sa.Integer)
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
    user_id: Optional[int] = Field(default=0, index=True, sa_type=sa.Integer)
    result: str = Field(sa_type=sa.String)
    from_bin: int = Field(sa_type=sa.Integer)
    to_bin: int = Field(sa_type=sa.Integer)
    created_at: datetime = Field(default_factory=utc_now, sa_type=sa.DateTime(timezone=True))


class CardStats(SQLModel):
    """Aggregated study stats for the selected user/deck."""

    total_cards: int
    active: int
    never: int
    hard_to_remember: int
    by_bin: Dict[int, int]
