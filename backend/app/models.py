from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class Card(SQLModel, table=True):
    """
    Represents a vocabulary flashcard.

    Attributes:
        id (Optional[int]): Primary key.
        word (str): The vocabulary word.
        definition (str): The word's definition.
        created_at (datetime): When the card was created.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    word: str
    definition: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCard(SQLModel, table=True):
    """
    Tracks a specific user's interaction with a flashcard.

    Attributes:
        id (Optional[int]): Primary key.
        user_id (Optional[int]): User identifier (single-user default in MVP).
        card_id (int): Associated Card's ID.
        bin (int): Current spaced repetition bin (0-11).
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

class Review(SQLModel, table=True):
    """
    Records each review attempt for a flashcard.

    Attributes:
        id (Optional[int]): Primary key.
        card_id (int): The reviewed Card's ID.
        user_id (Optional[int]): User identifier.
        result (str): 'correct' or 'wrong'.
        from_bin (int): Bin before the review.
        to_bin (int): Bin after the review.
        created_at (datetime): When the review took place.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    card_id: int = Field(foreign_key="card.id")
    user_id: Optional[int] = Field(default=1, index=True)
    result: str
    from_bin: int
    to_bin: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
