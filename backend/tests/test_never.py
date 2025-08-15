"""Ensure never/hard_to_remember cards are excluded from selection."""

from sqlmodel import Session
from app.models import Card, UserCard


def test_never_and_hard_excluded_from_selection(client, sqlite_session: Session):
    """Cards with status 'never' or 'hard_to_remember' should not be returned by /study/next."""
    # never
    c1 = Card(word="final", definition="x")
    sqlite_session.add(c1)
    sqlite_session.commit()
    sqlite_session.refresh(c1)
    sqlite_session.add(UserCard(card_id=c1.id, bin=11, status="never"))
    sqlite_session.commit()

    # hard_to_remember
    c2 = Card(word="stuck", definition="y")
    sqlite_session.add(c2)
    sqlite_session.commit()
    sqlite_session.refresh(c2)
    sqlite_session.add(UserCard(card_id=c2.id, bin=1, status="hard_to_remember"))
    sqlite_session.commit()

    # no active/new cards -> temporarily_done
    data = client.get("/study/next").json()
    assert data["status"] in {"temporarily_done", "permanently_done"}
