"""Regression tests for anonymous demo sessions and card skipping."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Card, Deck


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


def _mk_card(session: Session, word: str) -> Card:
    deck = _featured_deck(session)
    card = Card(
        deck_id=deck.id,
        word=word,
        definition=f"Definition for {word}",
        topic=deck.title,
        domain="Testing",
        kind="concept",
        is_builtin=True,
    )
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def test_skip_exclusion_draws_a_different_eligible_card(
    client: TestClient, sqlite_session: Session
) -> None:
    _mk_card(sqlite_session, "alpha")
    _mk_card(sqlite_session, "bravo")
    headers = {"X-Demo-Session": "skip-session"}

    first = client.get("/study/next", headers=headers)
    assert first.status_code == 200
    first_id = first.json()["card"]["id"]

    second = client.get(
        "/study/next",
        params={"exclude_card_ids": str(first_id)},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["status"] == "ok"
    assert second.json()["card"]["id"] != first_id


def test_skip_falls_back_after_every_eligible_card_is_excluded(
    client: TestClient, sqlite_session: Session
) -> None:
    card = _mk_card(sqlite_session, "only-card")
    headers = {"X-Demo-Session": "fallback-session"}

    response = client.get(
        "/study/next",
        params={"exclude_card_ids": str(card.id)},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["card"]["id"] == card.id


def test_anonymous_browser_sessions_have_isolated_progress(
    client: TestClient, sqlite_session: Session
) -> None:
    card = _mk_card(sqlite_session, "session-card")
    session_a = {"X-Demo-Session": "browser-session-a"}
    session_b = {"X-Demo-Session": "browser-session-b"}

    first_a = client.get("/study/next", headers=session_a)
    assert first_a.status_code == 200
    assert first_a.json()["card"]["bin"] == 0

    answer_a = client.post(
        "/study/answer",
        params={"card_id": card.id, "result": "correct"},
        headers=session_a,
    )
    assert answer_a.status_code == 200
    assert answer_a.json()["to_bin"] == 1

    first_b = client.get("/study/next", headers=session_b)
    assert first_b.status_code == 200
    assert first_b.json()["status"] == "ok"
    assert first_b.json()["card"]["id"] == card.id
    assert first_b.json()["card"]["bin"] == 0

    next_a = client.get("/study/next", headers=session_a)
    assert next_a.status_code == 200
    assert next_a.json()["status"] == "temporarily_done"
