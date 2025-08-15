"""Pydantic/SQLModel-compatible schemas (request/response DTOs)."""

from typing import Optional
from pydantic import BaseModel, Field


class CardCreate(BaseModel):
    """
    Payload for creating a new card.
    """

    word: str = Field(min_length=1)
    definition: str = Field(min_length=1)


class CardUpdate(BaseModel):
    """
    Partial update payload for a card.
    """

    word: Optional[str] = Field(default=None, min_length=1)
    definition: Optional[str] = Field(default=None, min_length=1)


class AdminCard(BaseModel):
    """
    Admin view model: a card plus study status fields.
    """

    id: int
    word: str
    definition: str
    bin: int
    wrong_count: int
    next_review_at: Optional[str]  # ISO8601 or None
    status: str


class Stats(BaseModel):
    """
    Aggregate counts for quick admin overview.
    """

    total_cards: int
    active: int
    never: int
    hard_to_remember: int
    by_bin: dict[int, int]
