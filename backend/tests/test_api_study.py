"""Endpoint tests for study flow: /study/next and /study/answer."""

from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select
from app.models import Card, UserCard


def _mk_card(s: Session, word="alpha", definition="a"):
    """Helper to insert a card + user state."""
    c = Card(word=word, definition=definition)
    s.add(c)
    s.commit()
    s.refresh(c)
    s.add(UserCard(card_id=c.id, bin=0))
    s.commit()
    return c


def test_next_returns_new_when_nothing_due(client, sqlite_session: Session):
    """When no due cards exist, /study/next should return a bin-0 card."""
    _mk_card(sqlite_session, "alpha", "a")
    r = client.get("/study/next")
    data = r.json()
    assert data["status"] == "ok"
    assert data["card"]["word"] == "alpha"


def test_answer_correct_moves_up_and_sets_timer(client, sqlite_session: Session):
    """Answering 'correct' should increase bin and set a positive next_review_at."""
    c = _mk_card(sqlite_session, "bravo", "b")

    # First get the card
    assert client.get("/study/next").json()["status"] == "ok"

    # Correct answer -> bin 1 (5s)
    r = client.post(f"/study/answer?card_id={c.id}&result=correct")
    payload = r.json()
    assert (
        payload["ok"] is True
        and payload["to_bin"] == 1
        and payload["status"] == "active"
    )

    # Verify next_review_at is in the future (~5s)
    uc = sqlite_session.exec(
        select(UserCard).where(UserCard.card_id == c.id)
    ).first()  # noqa: E701  (fallback for certain SQLModel versions) # type: ignore[attr-defined]
    # Safer re-fetch:
    uc = sqlite_session.exec(select(UserCard).where(UserCard.card_id == c.id)).first()  # type: ignore[attr-defined]
    assert uc.bin == 1
    assert uc.next_review_at is not None
    assert uc.next_review_at > datetime.now(timezone.utc).replace(tzinfo=None)


def test_answer_wrong_resets_bin_and_increments_wrong_count(
    client, sqlite_session: Session
):
    """Answering 'wrong' should set bin=1 and increment wrong_count."""
    c = _mk_card(sqlite_session, "charlie", "c")

    # Fetch the actual UserCard instance (not a ScalarResult)
    uc = sqlite_session.exec(
        select(UserCard).where(UserCard.card_id == c.id)  # type: ignore[attr-defined]
    ).first()
    assert uc is not None

    # Make it due in a higher bin to simulate real flow
    uc.bin = 3

    # If your model stores AWARE UTC datetimes:
    uc.next_review_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    # If your model stores NAIVE datetimes, use this instead:
    # uc.next_review_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)

    sqlite_session.add(uc)
    sqlite_session.commit()

    # Wrong answer
    before = uc.wrong_count
    r = client.post(f"/study/answer?card_id={c.id}&result=wrong")
    payload = r.json()
    assert payload["ok"] is True and payload["to_bin"] == 1

    sqlite_session.refresh(uc)
    assert uc.wrong_count == before + 1
    assert uc.bin == 1
