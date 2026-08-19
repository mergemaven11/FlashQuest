"""API tests for ephemeral solo Arcade sessions."""

from sqlmodel import Session

from app.models import Card, Deck, User
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str) -> User:
    user = User(
        email=f"arcade-{suffix}@example.com",
        display_name=f"Arcade {suffix.title()}",
        password_hash=hash_password("strong-pass-123"),
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _headers(session: Session, user: User) -> dict[str, str]:
    token = create_auth_session(session, int(user.id or 0))
    return {"Authorization": f"Bearer {token}"}


def _deck(
    session: Session,
    *,
    slug: str,
    visibility: str = "public",
    owner: User | None = None,
    card_count: int = 6,
) -> Deck:
    deck = Deck(
        owner_id=None if owner is None else owner.id,
        title=f"Arcade {slug}",
        slug=slug,
        description="Arcade API test deck",
        is_builtin=owner is None,
        subject="Testing",
        difficulty="beginner",
        visibility=visibility,
        tags=["arcade"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    for index in range(1, card_count + 1):
        session.add(
            Card(
                deck_id=deck.id,
                word=f"Question {index}",
                definition=f"Answer {index}",
                topic=deck.title,
                domain="Testing",
                kind="concept",
                is_builtin=deck.is_builtin,
            )
        )
    session.commit()
    return deck


def test_anonymous_browser_can_start_and_finish_blitz_round(client, sqlite_session: Session):
    deck = _deck(sqlite_session, slug="public-blitz")
    headers = {"X-Demo-Session": "arcade-browser-one"}

    start = client.post(
        "/activities/start",
        headers=headers,
        json={
            "deck_id": deck.id,
            "activity_type": "blitz",
            "round_count": 2,
            "seed": 123,
        },
    )
    assert start.status_code == 201
    prompt = start.json()
    assert prompt["phase"] == "prompt"
    assert prompt["mode"] == "solo"
    assert prompt["reveal"] is None
    assert "correct_choice_id" not in str(prompt)

    target_number = prompt["payload"]["prompt"].split()[-1]
    correct_choice = next(
        choice["id"]
        for choice in prompt["payload"]["choices"]
        if choice["text"] == f"Answer {target_number}"
    )
    result = client.post(
        f"/activities/{prompt['session_id']}/events",
        headers=headers,
        json={"type": "response.submitted", "payload": {"choice_id": correct_choice}},
    )
    assert result.status_code == 200
    result_payload = result.json()
    assert result_payload["phase"] == "result"
    assert result_payload["reveal"]["result"]["correct"] is True
    assert result_payload["participants"][0]["score"] == 100

    next_round = client.post(
        f"/activities/{prompt['session_id']}/events",
        headers=headers,
        json={"type": "round.completed"},
    )
    assert next_round.status_code == 200
    assert next_round.json()["phase"] == "prompt"
    assert next_round.json()["round_index"] == 1


def test_arcade_session_is_bound_to_anonymous_browser_session(client, sqlite_session: Session):
    deck = _deck(sqlite_session, slug="browser-owned")
    start = client.post(
        "/activities/start",
        headers={"X-Demo-Session": "browser-a"},
        json={"deck_id": deck.id, "activity_type": "blitz"},
    )
    assert start.status_code == 201
    session_id = start.json()["session_id"]

    other_browser = client.get(
        f"/activities/{session_id}",
        headers={"X-Demo-Session": "browser-b"},
    )
    assert other_browser.status_code == 404

    original_browser = client.get(
        f"/activities/{session_id}",
        headers={"X-Demo-Session": "browser-a"},
    )
    assert original_browser.status_code == 200


def test_anonymous_arcade_requires_browser_session_header(client, sqlite_session: Session):
    deck = _deck(sqlite_session, slug="needs-session")
    response = client.post(
        "/activities/start",
        json={"deck_id": deck.id, "activity_type": "blitz"},
    )
    assert response.status_code == 400


def test_anonymous_user_can_play_unlisted_deck(client, sqlite_session: Session):
    owner = _user(sqlite_session, "unlisted-owner")
    deck = _deck(
        sqlite_session,
        slug="unlisted-arcade",
        visibility="unlisted",
        owner=owner,
    )
    response = client.post(
        "/activities/start",
        headers={"X-Demo-Session": "unlisted-player"},
        json={"deck_id": deck.id, "activity_type": "match"},
    )
    assert response.status_code == 201
    assert response.json()["definition"]["type"] == "match"


def test_anonymous_user_cannot_play_private_deck(client, sqlite_session: Session):
    owner = _user(sqlite_session, "private-owner")
    deck = _deck(
        sqlite_session,
        slug="private-arcade",
        visibility="private",
        owner=owner,
    )
    response = client.post(
        "/activities/start",
        headers={"X-Demo-Session": "private-outsider"},
        json={"deck_id": deck.id, "activity_type": "blitz"},
    )
    assert response.status_code == 401


def test_signed_in_owner_can_play_private_deck(client, sqlite_session: Session):
    owner = _user(sqlite_session, "signed-owner")
    deck = _deck(
        sqlite_session,
        slug="signed-private-arcade",
        visibility="private",
        owner=owner,
    )
    response = client.post(
        "/activities/start",
        headers=_headers(sqlite_session, owner),
        json={"deck_id": deck.id, "activity_type": "blitz"},
    )
    assert response.status_code == 201


def test_arcade_rejects_deck_with_too_few_cards(client, sqlite_session: Session):
    deck = _deck(sqlite_session, slug="tiny-deck", card_count=3)
    response = client.post(
        "/activities/start",
        headers={"X-Demo-Session": "tiny-browser"},
        json={"deck_id": deck.id, "activity_type": "blitz"},
    )
    assert response.status_code == 422
    assert "at least 4" in response.json()["detail"]


def test_match_board_is_scored_by_server(client, sqlite_session: Session):
    deck = _deck(sqlite_session, slug="match-board", card_count=5)
    headers = {"X-Demo-Session": "match-browser"}
    start = client.post(
        "/activities/start",
        headers=headers,
        json={
            "deck_id": deck.id,
            "activity_type": "match",
            "round_count": 5,
            "seed": 456,
        },
    )
    assert start.status_code == 201
    prompt = start.json()
    assert prompt["reveal"] is None
    matches = {
        str(item["card_id"]): f"card-{item['card_id']}"
        for item in prompt["payload"]["prompts"]
    }

    result = client.post(
        f"/activities/{prompt['session_id']}/events",
        headers=headers,
        json={"type": "response.submitted", "payload": {"matches": matches}},
    )
    assert result.status_code == 200
    payload = result.json()
    assert payload["phase"] == "result"
    assert payload["reveal"]["result"]["perfect"] is True
    assert payload["reveal"]["result"]["correct_count"] == 5
    assert payload["participants"][0]["score"] == 500


def test_activity_session_cannot_be_mutated_after_completion(client, sqlite_session: Session):
    deck = _deck(sqlite_session, slug="one-round-complete", card_count=4)
    headers = {"X-Demo-Session": "complete-browser"}
    start = client.post(
        "/activities/start",
        headers=headers,
        json={
            "deck_id": deck.id,
            "activity_type": "blitz",
            "round_count": 1,
            "seed": 99,
        },
    ).json()
    target_number = start["payload"]["prompt"].split()[-1]
    choice = next(
        item["id"]
        for item in start["payload"]["choices"]
        if item["text"] == f"Answer {target_number}"
    )
    assert client.post(
        f"/activities/{start['session_id']}/events",
        headers=headers,
        json={"type": "response.submitted", "payload": {"choice_id": choice}},
    ).status_code == 200
    completed = client.post(
        f"/activities/{start['session_id']}/events",
        headers=headers,
        json={"type": "round.completed"},
    )
    assert completed.status_code == 200
    assert completed.json()["phase"] == "complete"

    invalid = client.post(
        f"/activities/{start['session_id']}/events",
        headers=headers,
        json={"type": "response.submitted", "payload": {"choice_id": choice}},
    )
    assert invalid.status_code == 409
