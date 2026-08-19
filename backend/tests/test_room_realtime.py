"""Realtime Quest Room ticket, chat, presence, and reconnect tests."""

from sqlmodel import Session, select

from app.models import Deck, User
from app.room_models import RoomMember, RoomMessage
from app.room_realtime import (
    MESSAGE_RATE_LIMIT,
    MessageRateLimiter,
    consume_ws_ticket,
    issue_ws_ticket,
)
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str) -> User:
    user = User(
        email=f"realtime-{suffix}@example.com",
        display_name=f"Realtime {suffix.title()}",
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


def _public_deck(session: Session, owner: User, slug: str) -> Deck:
    deck = Deck(
        owner_id=owner.id,
        title=f"Realtime Deck {slug}",
        slug=slug,
        description="Realtime room test deck",
        is_builtin=False,
        subject="Testing",
        difficulty="beginner",
        visibility="public",
        tags=["realtime"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return deck


def _public_room(client, session: Session, host: User, deck: Deck) -> dict:
    response = client.post(
        "/rooms",
        headers=_headers(session, host),
        json={
            "deck_id": int(deck.id or 0),
            "name": "Realtime Crew",
            "visibility": "public",
        },
    )
    assert response.status_code == 201
    return response.json()


def _join(client, session: Session, room_id: int, user: User) -> dict[str, str]:
    headers = _headers(session, user)
    response = client.post(f"/rooms/{room_id}/join", headers=headers)
    assert response.status_code == 200
    return headers


def _ticket(client, room_id: int, headers: dict[str, str]) -> str:
    response = client.post(f"/rooms/{room_id}/ws-ticket", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["expires_in_seconds"] == 45
    return payload["ticket"]


def test_ws_ticket_is_one_use_and_bound_to_room():
    raw = issue_ws_ticket(room_id=7, user_id=22)
    assert consume_ws_ticket(raw, room_id=8) is None
    # Room mismatch consumes the capability rather than leaving a reusable secret.
    assert consume_ws_ticket(raw, room_id=7) is None

    raw = issue_ws_ticket(room_id=7, user_id=22)
    ticket = consume_ws_ticket(raw, room_id=7)
    assert ticket is not None
    assert ticket.room_id == 7
    assert ticket.user_id == 22
    assert consume_ws_ticket(raw, room_id=7) is None


def test_ws_ticket_requires_active_membership(client, sqlite_session: Session):
    host = _user(sqlite_session, "ticket-host")
    stranger = _user(sqlite_session, "ticket-stranger")
    deck = _public_deck(sqlite_session, host, "ticket-deck")
    room = _public_room(client, sqlite_session, host, deck)

    denied = client.post(
        f"/rooms/{room['id']}/ws-ticket",
        headers=_headers(sqlite_session, stranger),
    )
    assert denied.status_code == 403

    joined_headers = _join(client, sqlite_session, room["id"], stranger)
    allowed = client.post(
        f"/rooms/{room['id']}/ws-ticket",
        headers=joined_headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["ticket"]


def test_two_websockets_exchange_persisted_chat_and_presence(client, sqlite_session: Session):
    host = _user(sqlite_session, "socket-host")
    member = _user(sqlite_session, "socket-member")
    deck = _public_deck(sqlite_session, host, "socket-deck")
    room = _public_room(client, sqlite_session, host, deck)
    host_headers = _headers(sqlite_session, host)
    member_headers = _join(client, sqlite_session, room["id"], member)
    host_ticket = _ticket(client, room["id"], host_headers)
    member_ticket = _ticket(client, room["id"], member_headers)

    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={host_ticket}"
    ) as host_ws:
        host_snapshot = host_ws.receive_json()
        assert host_snapshot["type"] == "room.snapshot"
        assert host_snapshot["payload"]["self_user_id"] == host.id
        assert len(host_snapshot["payload"]["presence"]) == 1
        assert host_ws.receive_json()["type"] == "presence.joined"

        with client.websocket_connect(
            f"/rooms/{room['id']}/ws?ticket={member_ticket}"
        ) as member_ws:
            member_snapshot = member_ws.receive_json()
            assert member_snapshot["type"] == "room.snapshot"
            assert len(member_snapshot["payload"]["presence"]) == 2

            host_joined = host_ws.receive_json()
            member_joined = member_ws.receive_json()
            assert host_joined["type"] == "presence.joined"
            assert member_joined["type"] == "presence.joined"
            assert host_joined["payload"]["user"]["user_id"] == member.id

            host_ws.send_json(
                {"type": "chat.send", "payload": {"body": "  hello   room  "}}
            )
            host_message = host_ws.receive_json()
            member_message = member_ws.receive_json()
            assert host_message["type"] == "message.created"
            assert member_message["type"] == "message.created"
            assert host_message["payload"]["message"]["body"] == "hello room"
            assert member_message["payload"]["message"]["id"] == host_message["payload"]["message"]["id"]
            assert host_message["payload"]["message"]["author_display_name"] == host.display_name

        left = host_ws.receive_json()
        assert left["type"] == "presence.left"
        assert left["payload"]["user"]["user_id"] == member.id
        assert len(left["payload"]["presence"]) == 1

    messages = sqlite_session.exec(
        select(RoomMessage).where(RoomMessage.room_id == room["id"])
    ).all()
    assert len(messages) == 1
    assert messages[0].body == "hello room"

    history = client.get(
        f"/rooms/{room['id']}/messages",
        headers=host_headers,
    )
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["body"] == "hello room"
    assert history.json()[0]["author_display_name"] == host.display_name


def test_reconnect_keeps_membership_and_message_history_single(client, sqlite_session: Session):
    host = _user(sqlite_session, "reconnect-host")
    member = _user(sqlite_session, "reconnect-member")
    deck = _public_deck(sqlite_session, host, "reconnect-deck")
    room = _public_room(client, sqlite_session, host, deck)
    headers = _join(client, sqlite_session, room["id"], member)

    first_ticket = _ticket(client, room["id"], headers)
    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={first_ticket}"
    ) as websocket:
        assert websocket.receive_json()["type"] == "room.snapshot"
        assert websocket.receive_json()["type"] == "presence.joined"
        websocket.send_json(
            {"type": "chat.send", "payload": {"body": "survive reconnect"}}
        )
        assert websocket.receive_json()["type"] == "message.created"

    second_ticket = _ticket(client, room["id"], headers)
    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={second_ticket}"
    ) as websocket:
        snapshot = websocket.receive_json()
        assert snapshot["type"] == "room.snapshot"
        assert [message["body"] for message in snapshot["payload"]["messages"]] == [
            "survive reconnect"
        ]
        assert websocket.receive_json()["type"] == "presence.joined"

    memberships = sqlite_session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room["id"], RoomMember.user_id == member.id
        )
    ).all()
    messages = sqlite_session.exec(
        select(RoomMessage).where(RoomMessage.room_id == room["id"])
    ).all()
    assert len(memberships) == 1
    assert memberships[0].status == "active"
    assert len(messages) == 1


def test_empty_and_oversized_chat_are_rejected_without_persistence(client, sqlite_session: Session):
    host = _user(sqlite_session, "invalid-host")
    deck = _public_deck(sqlite_session, host, "invalid-deck")
    room = _public_room(client, sqlite_session, host, deck)
    headers = _headers(sqlite_session, host)
    ticket = _ticket(client, room["id"], headers)

    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={ticket}"
    ) as websocket:
        assert websocket.receive_json()["type"] == "room.snapshot"
        assert websocket.receive_json()["type"] == "presence.joined"

        websocket.send_json({"type": "chat.send", "payload": {"body": "   "}})
        empty = websocket.receive_json()
        assert empty["type"] == "error"
        assert "empty" in empty["payload"]["message"].lower()

        websocket.send_json(
            {"type": "chat.send", "payload": {"body": "x" * 1_001}}
        )
        oversized = websocket.receive_json()
        assert oversized["type"] == "error"
        assert "1000" in oversized["payload"]["message"]

    assert sqlite_session.exec(select(RoomMessage)).all() == []


def test_message_rate_limiter_blocks_burst_after_limit():
    limiter = MessageRateLimiter()
    for _ in range(MESSAGE_RATE_LIMIT):
        assert limiter.allow(room_id=1, user_id=2) is True
    assert limiter.allow(room_id=1, user_id=2) is False
    # Limits are isolated by room/user instead of becoming a global throttle.
    assert limiter.allow(room_id=1, user_id=3) is True
    assert limiter.allow(room_id=2, user_id=2) is True
