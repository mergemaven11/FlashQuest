"""Synchronized Quest Room Arcade tests using the shared solo activity runtime."""

from sqlmodel import Session

from app.models import Card, Deck, User
from app.room_arcade import clear_room_activity
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str) -> User:
    user = User(
        email=f"room-arcade-{suffix}@example.com",
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


def _deck_with_cards(session: Session, owner: User, slug: str, count: int = 6) -> Deck:
    deck = Deck(
        owner_id=owner.id,
        title=f"Room Arcade {slug}",
        slug=slug,
        description="Shared Arcade test deck",
        is_builtin=False,
        subject="Testing",
        difficulty="beginner",
        visibility="public",
        tags=["arcade", "room"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    for index in range(1, count + 1):
        session.add(
            Card(
                deck_id=deck.id,
                word=f"Prompt {index}",
                definition=f"Definition {index}",
                topic=deck.title,
                domain="Room Arcade",
                kind="concept",
                is_builtin=False,
            )
        )
    session.commit()
    return deck


def _room(client, session: Session, host: User, deck: Deck) -> dict:
    response = client.post(
        "/rooms",
        headers=_headers(session, host),
        json={
            "deck_id": int(deck.id or 0),
            "name": "Arcade Party",
            "visibility": "public",
        },
    )
    assert response.status_code == 201
    room = response.json()
    clear_room_activity(room["id"])
    return room


def _join(client, session: Session, room_id: int, user: User) -> dict[str, str]:
    headers = _headers(session, user)
    response = client.post(f"/rooms/{room_id}/join", headers=headers)
    assert response.status_code == 200
    return headers


def _ticket(client, room_id: int, headers: dict[str, str]) -> str:
    response = client.post(f"/rooms/{room_id}/ws-ticket", headers=headers)
    assert response.status_code == 200
    return response.json()["ticket"]


def _open_host(client, room_id: int, ticket: str):
    return client.websocket_connect(f"/rooms/{room_id}/ws?ticket={ticket}")


def test_blitz_two_players_submit_chat_reveal_and_advance(client, sqlite_session: Session):
    host = _user(sqlite_session, "blitz-host")
    member = _user(sqlite_session, "blitz-member")
    deck = _deck_with_cards(sqlite_session, host, "blitz")
    room = _room(client, sqlite_session, host, deck)
    host_headers = _headers(sqlite_session, host)
    member_headers = _join(client, sqlite_session, room["id"], member)

    with _open_host(client, room["id"], _ticket(client, room["id"], host_headers)) as host_ws:
        host_snapshot = host_ws.receive_json()
        assert host_snapshot["type"] == "room.snapshot"
        assert host_snapshot["payload"]["activity"] is None
        assert host_ws.receive_json()["type"] == "presence.joined"

        with client.websocket_connect(
            f"/rooms/{room['id']}/ws?ticket={_ticket(client, room['id'], member_headers)}"
        ) as member_ws:
            assert member_ws.receive_json()["type"] == "room.snapshot"
            assert host_ws.receive_json()["type"] == "presence.joined"
            assert member_ws.receive_json()["type"] == "presence.joined"

            host_ws.send_json(
                {
                    "type": "activity.start",
                    "payload": {"activity_type": "blitz", "round_count": 2},
                }
            )
            host_started = host_ws.receive_json()
            member_started = member_ws.receive_json()
            assert host_started["type"] == "activity.started"
            assert member_started["type"] == "activity.started"
            activity = host_started["payload"]["activity"]
            state = activity["state"]
            assert state["definition"]["type"] == "blitz"
            assert state["mode"] == "room"
            assert state["phase"] == "prompt"
            assert state["reveal"] is None
            assert activity["submitted_count"] == 0

            # The test can derive the implementation's correct choice from the
            # target card id; clients never receive a correct_choice_id pre-reveal.
            correct_choice = f"card-{state['payload']['card_id']}"
            assert "correct_choice_id" not in state["payload"]

            member_ws.send_json(
                {"type": "activity.submit", "payload": {"choice_id": "card-999999"}}
            )
            host_submitted = host_ws.receive_json()
            member_submitted = member_ws.receive_json()
            assert host_submitted["type"] == "activity.submitted"
            assert member_submitted["type"] == "activity.submitted"
            assert host_submitted["payload"]["submitted_user_ids"] == [member.id]

            host_ws.send_json(
                {"type": "activity.submit", "payload": {"choice_id": correct_choice}}
            )
            host_submit_two = host_ws.receive_json()
            member_submit_two = member_ws.receive_json()
            assert host_submit_two["payload"]["submitted_count"] == 2
            assert member_submit_two["payload"]["submitted_count"] == 2

            # Chat remains usable while a game is active.
            member_ws.send_json(
                {"type": "chat.send", "payload": {"body": "good luck on reveal"}}
            )
            host_chat = host_ws.receive_json()
            member_chat = member_ws.receive_json()
            assert host_chat["type"] == "message.created"
            assert member_chat["payload"]["message"]["body"] == "good luck on reveal"

            host_ws.send_json({"type": "activity.reveal", "payload": {}})
            host_reveal = host_ws.receive_json()
            member_reveal = member_ws.receive_json()
            assert host_reveal["type"] == "activity.state"
            assert member_reveal["type"] == "activity.state"
            revealed = host_reveal["payload"]["activity"]["state"]
            assert revealed["phase"] == "reveal"
            assert revealed["reveal"]["correct_choice_id"] == correct_choice
            scores = {
                participant["participant_id"]: participant["score"]
                for participant in revealed["participants"]
            }
            assert scores[str(host.id)] == 100
            assert scores[str(member.id)] == 0

            host_ws.send_json({"type": "activity.next", "payload": {}})
            host_next = host_ws.receive_json()
            member_next = member_ws.receive_json()
            assert host_next["type"] == "activity.state"
            assert member_next["type"] == "activity.state"
            next_activity = host_next["payload"]["activity"]
            assert next_activity["state"]["phase"] == "prompt"
            assert next_activity["state"]["round_index"] == 1
            assert next_activity["submitted_user_ids"] == []


def test_late_join_snapshot_restores_current_activity_without_answer_leak(
    client, sqlite_session: Session
):
    host = _user(sqlite_session, "late-host")
    late = _user(sqlite_session, "late-member")
    deck = _deck_with_cards(sqlite_session, host, "late")
    room = _room(client, sqlite_session, host, deck)
    host_headers = _headers(sqlite_session, host)

    with _open_host(client, room["id"], _ticket(client, room["id"], host_headers)) as host_ws:
        assert host_ws.receive_json()["type"] == "room.snapshot"
        assert host_ws.receive_json()["type"] == "presence.joined"
        host_ws.send_json(
            {"type": "activity.start", "payload": {"activity_type": "blitz", "round_count": 2}}
        )
        started = host_ws.receive_json()["payload"]["activity"]
        assert started["state"]["reveal"] is None

        late_headers = _join(client, sqlite_session, room["id"], late)
        with client.websocket_connect(
            f"/rooms/{room['id']}/ws?ticket={_ticket(client, room['id'], late_headers)}"
        ) as late_ws:
            snapshot = late_ws.receive_json()
            assert snapshot["type"] == "room.snapshot"
            restored = snapshot["payload"]["activity"]
            assert restored["state"]["session_id"] == started["state"]["session_id"]
            assert restored["state"]["phase"] == "prompt"
            assert restored["state"]["reveal"] is None


def test_non_host_cannot_start_or_control_room_arcade(client, sqlite_session: Session):
    host = _user(sqlite_session, "permission-host")
    member = _user(sqlite_session, "permission-member")
    deck = _deck_with_cards(sqlite_session, host, "permission")
    room = _room(client, sqlite_session, host, deck)
    member_headers = _join(client, sqlite_session, room["id"], member)

    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={_ticket(client, room['id'], member_headers)}"
    ) as websocket:
        assert websocket.receive_json()["type"] == "room.snapshot"
        assert websocket.receive_json()["type"] == "presence.joined"
        websocket.send_json(
            {"type": "activity.start", "payload": {"activity_type": "blitz"}}
        )
        denied = websocket.receive_json()
        assert denied["type"] == "error"
        assert "host" in denied["payload"]["message"].lower()


def test_match_quest_uses_same_room_runtime_and_scores_on_reveal(client, sqlite_session: Session):
    host = _user(sqlite_session, "match-host")
    deck = _deck_with_cards(sqlite_session, host, "match", count=5)
    room = _room(client, sqlite_session, host, deck)
    host_headers = _headers(sqlite_session, host)

    with _open_host(client, room["id"], _ticket(client, room["id"], host_headers)) as websocket:
        assert websocket.receive_json()["type"] == "room.snapshot"
        assert websocket.receive_json()["type"] == "presence.joined"

        websocket.send_json(
            {"type": "activity.start", "payload": {"activity_type": "match", "round_count": 5}}
        )
        started = websocket.receive_json()
        state = started["payload"]["activity"]["state"]
        assert state["definition"]["type"] == "match"
        assert state["mode"] == "room"
        assert state["reveal"] is None
        matches = {
            str(prompt["card_id"]): f"card-{prompt['card_id']}"
            for prompt in state["payload"]["prompts"]
        }

        websocket.send_json({"type": "activity.submit", "payload": {"matches": matches}})
        submitted = websocket.receive_json()
        assert submitted["type"] == "activity.submitted"
        assert submitted["payload"]["submitted_count"] == 1

        websocket.send_json({"type": "activity.reveal", "payload": {}})
        revealed_event = websocket.receive_json()
        revealed = revealed_event["payload"]["activity"]["state"]
        assert revealed["phase"] == "reveal"
        assert revealed["reveal"]["answer_map"] == matches
        assert revealed["participants"][0]["score"] == 500
        assert revealed["participants"][0]["response"] == "5/5"

        websocket.send_json({"type": "activity.next", "payload": {}})
        completed = websocket.receive_json()
        assert completed["type"] == "activity.completed"
        assert completed["payload"]["activity"]["state"]["phase"] == "complete"
