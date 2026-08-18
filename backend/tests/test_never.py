"""Ensure never/hard_to_remember cards are excluded from featured selection."""

from sqlmodel import Session

from app.models import Card, Deck, UserCard
from app.security import DEMO_USER_ID


def test_never_and_hard_excluded_from_selection(client, sqlite_session: Session):
    deck = Deck(
        owner_id=None,
        title="Platform Engineering",
        slug="platform-engineering",
        description="Test starter",
        is_builtin=True,
    )
    sqlite_session.add(deck)
    sqlite_session.commit()
    sqlite_session.refresh(deck)

    c1 = Card(
        deck_id=deck.id,
        word="final",
        definition="x",
        topic=deck.title,
        is_builtin=True,
    )
    sqlite_session.add(c1)
    sqlite_session.commit()
    sqlite_session.refresh(c1)
    sqlite_session.add(
        UserCard(user_id=DEMO_USER_ID, card_id=int(c1.id or 0), bin=11, status="never")
    )

    c2 = Card(
        deck_id=deck.id,
        word="stuck",
        definition="y",
        topic=deck.title,
        is_builtin=True,
    )
    sqlite_session.add(c2)
    sqlite_session.commit()
    sqlite_session.refresh(c2)
    sqlite_session.add(
        UserCard(
            user_id=DEMO_USER_ID,
            card_id=int(c2.id or 0),
            bin=1,
            status="hard_to_remember",
        )
    )
    sqlite_session.commit()

    data = client.get("/study/next").json()
    assert data["status"] in {"temporarily_done", "permanently_done"}
