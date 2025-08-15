from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, Dict
from sqlmodel import SQLModel, Field


class CardBase(SQLModel):
    """Base model for vocabulary flashcards.

    Attributes:
        word (str): The vocabulary word.
        definition (str): The word's definition.
    """

    word: str
    definition: str


class CardCreate(CardBase):
    """Schema for creating a new card.

    Inherits all fields from CardBase.
    """

    pass


class CardRead(CardBase):
    """Schema for reading card data.

    Extends CardBase to include:
        id (int): Primary key.
        created_at (datetime): When the card was created.
    """

    id: int
    created_at: datetime


class CardAdminRead(SQLModel):
    """Card plus user-specific admin fields."""

    id: int
    word: str
    definition: str
    created_at: datetime
    bin: int
    status: str


class CardUpdate(SQLModel):
    """Fields that can be updated on a Card.

    All fields are optional so this schema can be used for partial updates.
    """

    word: Optional[str] = None
    definition: Optional[str] = None


class Card(SQLModel, table=True):  # type: ignore[call-arg]
    """Database model representing a vocabulary flashcard.

    Attributes:
        id (Optional[int]): Primary key.
        word (str): The vocabulary word.
        definition (str): The word's definition.
        created_at (datetime): When the card was created (UTC).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    word: str
    definition: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCard(SQLModel, table=True):  # type: ignore[call-arg]
    """Database model tracking a specific user's interaction with a flashcard.

    Attributes:
        id (Optional[int]): Primary key.
        user_id (Optional[int]): User identifier (defaults to 1 for MVP).
        card_id (int): Associated Card's ID.
        bin (int): Current spaced repetition bin (0–11).
        wrong_count (int): Lifetime incorrect answers for this card.
        next_review_at (Optional[datetime]): Next time the card should be reviewed.
        status (str): 'active', 'hard_to_remember', or 'never'.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=1, index=True)
    card_id: int = Field(foreign_key="card.id", index=True)
    bin: int = Field(default=0)
    wrong_count: int = Field(default=0)
    next_review_at: Optional[datetime] = None
    status: str = Field(default="active")


class Review(SQLModel, table=True):  # type: ignore[call-arg]
    """Database model recording each review attempt for a flashcard.

    Attributes:
        id (Optional[int]): Primary key.
        card_id (int): The reviewed Card's ID.
        user_id (Optional[int]): User identifier.
        result (str): 'correct' or 'wrong'.
        from_bin (int): Bin before the review.
        to_bin (int): Bin after the review.
        created_at (datetime): When the review took place (UTC).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    card_id: int = Field(foreign_key="card.id")
    user_id: Optional[int] = Field(default=1, index=True)
    result: str
    from_bin: int
    to_bin: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CardStats(SQLModel):
    total_cards: int
    active: int
    never: int
    hard_to_remember: int
    by_bin: Dict[int, int]  # keys 0..11
