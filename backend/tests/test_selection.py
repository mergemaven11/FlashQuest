"""Unit tests for the next-card selection order.

Selection order must be:
  1) Due cards (bin >= 1) first, preferring higher bins
  2) New cards (bin 0) if nothing is due
"""

from datetime import datetime, timedelta, timezone
from sqlmodel import SQLModel, create_engine, Session
from app.models import Card, UserCard
from app.routers.study import select_next_card


def test_prefers_higher_bin_due():
    """Prefer higher-bin due cards over lower-bin due cards.

    Given:
        - One due card in bin 2
        - One due card in bin 3
        - One new card in bin 0
    When:
        - Selecting the next card
    Then:
        - The bin 3 card is chosen.
    """
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    now = datetime.now(timezone.utc)

    with Session(engine) as s:
        c1 = Card(word="alpha", definition="a"); s.add(c1); s.commit(); s.refresh(c1)
        s.add(UserCard(card_id=c1.id, bin=2, next_review_at=now - timedelta(seconds=1)))

        c2 = Card(word="bravo", definition="b"); s.add(c2); s.commit(); s.refresh(c2)
        s.add(UserCard(card_id=c2.id, bin=3, next_review_at=now - timedelta(seconds=1)))

        c3 = Card(word="charlie", definition="c"); s.add(c3); s.commit(); s.refresh(c3)
        s.add(UserCard(card_id=c3.id, bin=0))

        s.commit()

        picked = select_next_card(s)
        assert picked.word == "bravo"
