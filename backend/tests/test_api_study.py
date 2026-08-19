"""Endpoint tests for featured-deck study flow."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Card, Deck, UserCard
from app.routers.study import POSTGRES_INTEGER_MAX, _demo_user_id
from app.security import DEMO_USER_ID


def _as_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _featured_deck(session: Session) -> Deck:
    deck = session.exec(select(Deck).where(Deck.slug == "platform-engineering")).first()
    if deck is None:
        deck = Deck(
            owner_id=None,
            title="Platform Engineering",
            slug="platform-engineering",
            description="Test featured deck",
            is_builtin=True,
        )
        session.add(deck)
        session.commit()
        session.refresh(deck)
    return deck


def _mk_card(
    session: Session, word: str = "alpha", definition: str = "a", kind: str = "concept"
) -> Card:
    deck = _featured_deck(session)
    card = Card(
        deck_id=deck.id,
        word=word,
        definition=definition,
        topic=deck.title,
        domain="Testing",
        kind=kind,
        is_builtin=True,
    )
    session.add(card)
    session.commit()
    session.refresh(card)
    session.add(UserCard(user_id=DEMO_USER_ID, card_id=int(card.id or 0), bin=0))
    session.commit()
    return card


def test_demo_session_ids_fit_postgres_integer_range() -> None:
    first = _demo_user_id("browser-session-a")
    second = _demo_user_id("browser-session-b")

    assert -POSTGRES_INTEGER_MAX <= first <= -1
    assert -POSTGRES_INTEGER_MAX <= second <= -1
    assert first == _demo_user_id("browser-session-a")
    assert first != second


def test_demo_session_header_creates_safe_progress_id(
    client: TestClient, sqlite_session: Session
) -> None:
    card = _mk_card(sqlite_session, "session-safe", "safe")
    token = "browser-session-a"
    expected_user_id = _demo_user_id(token)

    response = client.get("/study/next", headers={"X-Demo-Session": token})

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert -POSTGRES_INTEGER_MAX <= expected_user_id <= -1
    progress = sqlite_session.exec(
        select(UserCard).where(
            UserCard.user_id == expected_user_id,
            cast(Any, UserCard.card_id) == card.id,
        )
    ).first()
    assert progress is not None


def test_next_returns_new_when_nothing_due(
    client: TestClient, sqlite_session: Session
) -> None:
    _mk_card(sqlite_session, "alpha", "a")
    response = client.get("/study/next")
    data = response.json()
    assert response.status_code == 200
    assert data["status"] == "ok"
    assert data["card"]["word"] == "alpha"
    assert data["deck"]["title"] == "Platform Engineering"


def test_track_filter_can_select_lab(client: TestClient, sqlite_session: Session) -> None:
    _mk_card(sqlite_session, "Concept", "c", "concept")
    _mk_card(sqlite_session, "Lab challenge", "l", "lab")
    response = client.get("/study/next", params={"track": "lab"})
    assert response.status_code == 200
    assert response.json()["card"]["kind"] == "lab"


def test_answer_correct_moves_up_and_sets_timer(
    client: TestClient, sqlite_session: Session
) -> None:
    card = _mk_card(sqlite_session, "bravo", "b")
    assert client.get("/study/next").json()["status"] == "ok"

    response = client.post(
        "/study/answer", params={"card_id": card.id, "result": "correct"}
    )
    payload = response.json()
    assert payload["ok"] is True
    assert payload["to_bin"] == 1
    assert payload["status"] == "active"

    uc = sqlite_session.exec(
        select(UserCard).where(cast(Any, UserCard.card_id) == card.id)
    ).first()
    assert uc is not None
    assert uc.bin == 1
    assert uc.next_review_at is not None
    assert _as_aware_utc(uc.next_review_at) > datetime.now(timezone.utc)


def test_answer_wrong_resets_bin_and_increments_wrong_count(
    client: TestClient, sqlite_session: Session
) -> None:
    card = _mk_card(sqlite_session, "charlie", "c")
    uc = sqlite_session.exec(
        select(UserCard).where(cast(Any, UserCard.card_id) == card.id)
    ).first()
    assert uc is not None

    uc.bin = 3
    uc.next_review_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    sqlite_session.add(uc)
    sqlite_session.commit()

    before = uc.wrong_count
    payload = client.post(
        "/study/answer", params={"card_id": card.id, "result": "wrong"}
    ).json()
    assert payload["ok"] is True and payload["to_bin"] == 1

    sqlite_session.refresh(uc)
    assert uc.wrong_count == before + 1
    assert uc.bin == 1
