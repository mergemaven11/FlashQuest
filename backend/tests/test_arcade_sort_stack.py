"""End-to-end coverage for Sort the Stack in solo Arcade and Quest Rooms."""

from sqlmodel import Session

from app.models import Card, Deck, User
from app.room_arcade import clear_room_activity
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str) -> User:
    user = User(
        email=f"sort-{suffix}@example.com",
        display_name=f"Sort {suffix.title()}",
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
    owner: User | None = None,
    split_domains: bool = True,
) -> tuple[Deck, dict[int, str]]:
    deck = Deck(
        owner_id=None if owner is None else owner.id,
        title=f"Sort Stack {slug}",
        slug=slug,
        description="Sort the Stack test deck",
        is_builtin=owner is None,
        subject="Testing",
        difficulty="beginner",
        visibility="public",
        tags=["sort", "arcade"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)

    domain_by_id: dict[int, str] = {}
    for index in range(1, 7):
        domain = "Foundations" if not split_domains or index <= 3 else "Operations"
        card = Card(
            deck_id=deck.id,
            word=f"Sort prompt {index}",
            definition=f"Sort clue {index}",
            topic=deck.title,
            domain=domain,
            kind="concept",
            is_builtin=deck.is_builtin,
        )
        session.add(card)
        session.commit()
        session.refresh(card)
        domain_by_id[int(card.id or 0)] = domain
    return deck, domain_by_id


def _room(client, session: Session, host: User, deck: Deck) -> dict:
    response = client.post(
        "/rooms",
        headers=_headers(session, host),
        json={
            "deck_id": int(deck.id or 0),
            "name": "Sort Party",
            "visibility": "public",
        },
    )
    assert response.status_code == 201
    room = response.json()
    clear_room_activity(room["id"])
    return room


def _ticket(client, room_id: int, headers: dict[str, str]) -> str:
    response = client.post(f"/rooms/{room_id}/ws-ticket", headers=headers)
    assert response.status_code == 200
    return response.json()["ticket"]


def test_solo_sort_stack_hides_domains_then_scores_perfect_board(
    client, sqlite_session: Session
):
    deck, domain_by_id = _deck(sqlite_session, slug="solo")
    headers = {"X-Demo-Session": "sort-stack-solo-browser"}

    start = client.post(
        "/activities/start",
        headers=headers,
        json={
            "deck_id": deck.id,
            "activity_type": "sort",
            "round_count": 6,
            "seed": 2468,
        },
    )
    assert start.status_code == 201
    prompt = start.json()
    assert prompt["definition"]["type"] == "sort"
    assert prompt["mode"] == "solo"
    assert prompt["reveal"] is None
    assert prompt["payload"]["buckets"] == ["Foundations", "Operations"]
    assert all("domain" not in item for item in prompt["payload"]["items"])
    assert "answer_map" not in str(prompt)

    placements = {
        str(item["card_id"]): domain_by_id[item["card_id"]]
        for item in prompt["payload"]["items"]
    }
    result = client.post(
        f"/activities/{prompt['session_id']}/events",
        headers=headers,
        json={
            "type": "response.submitted",
            "payload": {"placements": placements},
        },
    )
    assert result.status_code == 200
    payload = result.json()
    assert payload["phase"] == "result"
    assert payload["reveal"]["answer_map"] == placements
    assert payload["reveal"]["result"]["perfect"] is True
    assert payload["reveal"]["result"]["correct_count"] == 6
    assert payload["participants"][0]["score"] == 500


def test_solo_sort_stack_rejects_deck_without_two_domains(client, sqlite_session: Session):
    deck, _domains = _deck(
        sqlite_session,
        slug="one-domain",
        split_domains=False,
    )
    response = client.post(
        "/activities/start",
        headers={"X-Demo-Session": "sort-stack-one-domain"},
        json={"deck_id": deck.id, "activity_type": "sort"},
    )
    assert response.status_code == 422
    assert "at least two distinct domains" in response.json()["detail"]


def test_room_sort_stack_uses_pending_submission_and_synchronized_reveal(
    client, sqlite_session: Session
):
    host = _user(sqlite_session, "room-host")
    deck, domain_by_id = _deck(sqlite_session, slug="room", owner=host)
    room = _room(client, sqlite_session, host, deck)
    headers = _headers(sqlite_session, host)

    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={_ticket(client, room['id'], headers)}"
    ) as websocket:
        assert websocket.receive_json()["type"] == "room.snapshot"
        assert websocket.receive_json()["type"] == "presence.joined"

        websocket.send_json(
            {
                "type": "activity.start",
                "payload": {"activity_type": "sort", "round_count": 6},
            }
        )
        started = websocket.receive_json()
        assert started["type"] == "activity.started"
        activity = started["payload"]["activity"]
        state = activity["state"]
        assert state["definition"]["type"] == "sort"
        assert state["mode"] == "room"
        assert state["reveal"] is None
        assert all("domain" not in item for item in state["payload"]["items"])

        placements = {
            str(item["card_id"]): domain_by_id[item["card_id"]]
            for item in state["payload"]["items"]
        }
        websocket.send_json(
            {"type": "activity.submit", "payload": {"placements": placements}}
        )
        submitted = websocket.receive_json()
        assert submitted["type"] == "activity.submitted"
        assert submitted["payload"]["submitted_count"] == 1
        assert "placements" not in str(submitted)

        websocket.send_json({"type": "activity.reveal", "payload": {}})
        revealed_event = websocket.receive_json()
        assert revealed_event["type"] == "activity.state"
        revealed = revealed_event["payload"]["activity"]["state"]
        assert revealed["phase"] == "reveal"
        assert revealed["reveal"]["answer_map"] == placements
        assert revealed["participants"][0]["score"] == 500
        assert revealed["participants"][0]["response"] == "6/6"

        websocket.send_json({"type": "activity.next", "payload": {}})
        completed = websocket.receive_json()
        assert completed["type"] == "activity.completed"
        assert completed["payload"]["activity"]["state"]["phase"] == "complete"
