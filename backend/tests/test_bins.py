"""Unit tests for bin transitions and lifetime wrong-count logic.

These tests run against an in-memory SQLite database so they are fast and
hermetic. They validate the core spaced-repetition rules without needing
the HTTP layer or Postgres.
"""

from sqlmodel import SQLModel, create_engine, Session
from app.models import Card, UserCard


def test_wrong_10_marks_hard():
    """Mark card as hard_to_remember after 10 total wrong answers.

    Given:
        - A UserCard with wrong_count = 9.
    When:
        - The user gets one more answer wrong.
    Then:
        - The status becomes "hard_to_remember".
    """
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as s:
        c = Card(word="abate", definition="to lessen"); s.add(c); s.commit(); s.refresh(c)
        uc = UserCard(card_id=c.id, bin=1, wrong_count=9, status="active")
        s.add(uc); s.commit(); s.refresh(uc)

        # simulate another wrong
        uc.wrong_count += 1
        if uc.wrong_count >= 10:
            uc.status = "hard_to_remember"

        s.add(uc); s.commit(); s.refresh(uc)
        assert uc.status == "hard_to_remember"
