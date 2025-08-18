# Here’s the updated **`tests/test_api_study.py`** with a helper that normalizes datetimes to **aware UTC** before comparison,
# plus clear docstrings/comments:


"""Endpoint tests for study flow: /study/next and /study/answer.

These tests exercise the selection logic (next card) and the bin/spacing updates
when answering correct or wrong. SQLite may strip tzinfo on datetime columns, so
we normalize DB datetimes to *aware UTC* before comparing to `datetime.now(UTC)`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Card, UserCard


def _as_aware_utc(dt: datetime) -> datetime:
    """Normalize a datetime to timezone-aware UTC.

    Args:
        dt: A datetime that may be naive (no tzinfo) or offset-aware.

    Returns:
        datetime: A timezone-aware UTC datetime suitable for comparisons.
    """
    if dt.tzinfo is None:
        # SQLite often returns naive datetimes; assume they are UTC in tests.
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _mk_card(s: Session, word: str = "alpha", definition: str = "a") -> Card:
    """Insert a Card and its initial UserCard row (bin 0).

    Args:
        s: Open SQLModel session.
        word: The vocabulary word.
        definition: The word's definition.

    Returns:
        The created Card (refreshed with its ID).
    """
    c = Card(word=word, definition=definition)
    s.add(c)
    s.commit()
    s.refresh(c)
    s.add(UserCard(card_id=c.id, bin=0))
    s.commit()
    return c


def test_next_returns_new_when_nothing_due(
    client: TestClient, sqlite_session: Session
) -> None:
    """When no due cards exist, /study/next should return a bin-0 card."""
    _mk_card(sqlite_session, "alpha", "a")
    r = client.get("/study/next")
    data = r.json()
    assert data["status"] == "ok"
    assert data["card"]["word"] == "alpha"


def test_answer_correct_moves_up_and_sets_timer(
    client: TestClient, sqlite_session: Session
) -> None:
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
    uc_stmt = select(UserCard).where(cast(Any, UserCard.card_id) == c.id)
    uc = sqlite_session.exec(uc_stmt).first()
    assert uc is not None
    assert uc.bin == 1
    assert uc.next_review_at is not None

    # Normalize possible naive DB datetime to aware UTC before comparing
    assert _as_aware_utc(uc.next_review_at) > datetime.now(timezone.utc)


def test_answer_wrong_resets_bin_and_increments_wrong_count(
    client: TestClient, sqlite_session: Session
) -> None:
    """Answering 'wrong' should set bin=1 and increment wrong_count."""
    c = _mk_card(sqlite_session, "charlie", "c")

    # Fetch the actual UserCard instance
    uc_stmt = select(UserCard).where(cast(Any, UserCard.card_id) == c.id)
    uc = sqlite_session.exec(uc_stmt).first()
    assert uc is not None

    # Make it due in a higher bin to simulate real flow
    uc.bin = 3
    uc.next_review_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    sqlite_session.add(uc)
    sqlite_session.commit()

    # Wrong answer
    before = uc.wrong_count
    payload = client.post(f"/study/answer?card_id={c.id}&result=wrong").json()
    assert payload["ok"] is True and payload["to_bin"] == 1

    sqlite_session.refresh(uc)
    assert uc.wrong_count == before + 1
    assert uc.bin == 1
