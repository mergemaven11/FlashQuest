"""Private/invite-only Quest Room access and live revocation tests."""

from datetime import timedelta

import pytest
from sqlmodel import Session, select
from starlette.websockets import WebSocketDisconnect

from app.models import Deck, User, utc_now
from app.room_models import RoomInvite, RoomMember
from app.security import create_auth_session, hash_password, hash_token


def _user(session: Session, suffix: str, *, verified: bool = True) -> User:
    user = User(
        email=f"invite-{suffix}@example.com",
        display_name=f"Invite {suffix.title()}",
        password_hash=hash_password("strong-pass-123"),
        is_verified=verified,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _headers(session: Session, user: User) -> dict[str, str]:
    token = create_auth_session(session, int(user.id or 0))
    return {"Authorization": f"Bearer {token}"}


def _deck(session: Session, owner: User, slug: str) -> Deck:
    deck = Deck(
        owner_id=owner.id,
        title=f"Invite Deck {slug}",
        slug=slug,
        description="Invite room test deck",
        is_builtin=False,
        subject="Testing",
        difficulty="beginner",
        visibility="public",
        tags=["invites"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return deck


def _room(client, session: Session, host: User, visibility: str, slug: str) -> dict:
    deck = _deck(session, host, slug)
    response = client.post(
        "/rooms",
        headers=_headers(session, host),
        json={
            "deck_id": int(deck.id or 0),
            "name": f"{visibility} study room",
            "visibility": visibility,
        },
    )
    assert response.status_code == 201
    return response.json()


def _invite(client, session: Session, host: User, room_id: int, hours: int = 24) -> dict:
    response = client.post(
        f"/rooms/{room_id}/invites",
        headers=_headers(session, host),
        json={"expires_in_hours": hours},
    )
    assert response.status_code == 201
    return response.json()


def _ticket(client, session: Session, user: User, room_id: int) -> str:
    response = client.post(
        f"/rooms/{room_id}/ws-ticket",
        headers=_headers(session, user),
    )
    assert response.status_code == 200
    return response.json()["ticket"]


def test_invite_token_is_hashed_at_rest_and_returned_only_when_issued(
    client, sqlite_session: Session
):
    host = _user(sqlite_session, "hash-host")
    room = _room(client, sqlite_session, host, "invite_only", "hash-room")

    issued = _invite(client, sqlite_session, host, room["id"])
    assert len(issued["token"]) >= 20
    stored = sqlite_session.get(RoomInvite, issued["id"])
    assert stored is not None
    assert stored.token_hash == hash_token(issued["token"])
    assert stored.token_hash != issued["token"]

    listing = client.get(
        f"/rooms/{room['id']}/invites",
        headers=_headers(sqlite_session, host),
    )
    assert listing.status_code == 200
    assert listing.json()[0]["id"] == issued["id"]
    assert "token" not in listing.json()[0]
    assert "token_hash" not in listing.json()[0]


def test_valid_invite_joins_hidden_room_and_is_reusable_for_group(
    client, sqlite_session: Session
):
    host = _user(sqlite_session, "group-host")
    first = _user(sqlite_session, "group-first")
    second = _user(sqlite_session, "group-second")
    room = _room(client, sqlite_session, host, "invite_only", "group-room")
    issued = _invite(client, sqlite_session, host, room["id"])

    # Knowing the id alone does not make the room readable.
    hidden = client.get(
        f"/rooms/{room['id']}",
        headers=_headers(sqlite_session, first),
    )
    assert hidden.status_code == 404

    for member in (first, second):
        joined = client.post(
            "/rooms/invites/join",
            headers=_headers(sqlite_session, member),
            json={"token": issued["token"]},
        )
        assert joined.status_code == 200
        assert joined.json()["id"] == room["id"]
        assert joined.json()["current_user_role"] == "member"

    stored = sqlite_session.get(RoomInvite, issued["id"])
    assert stored is not None
    assert stored.use_count == 2
    assert stored.last_used_at is not None


def test_revoked_invite_stops_working_immediately(client, sqlite_session: Session):
    host = _user(sqlite_session, "revoke-host")
    outsider = _user(sqlite_session, "revoke-outsider")
    room = _room(client, sqlite_session, host, "invite_only", "revoke-room")
    issued = _invite(client, sqlite_session, host, room["id"])

    revoked = client.post(
        f"/rooms/{room['id']}/invites/{issued['id']}/revoke",
        headers=_headers(sqlite_session, host),
    )
    assert revoked.status_code == 200
    assert revoked.json()["active"] is False
    assert revoked.json()["revoked_at"] is not None

    denied = client.post(
        "/rooms/invites/join",
        headers=_headers(sqlite_session, outsider),
        json={"token": issued["token"]},
    )
    assert denied.status_code == 404


def test_expired_invite_stops_working(client, sqlite_session: Session):
    host = _user(sqlite_session, "expired-host")
    outsider = _user(sqlite_session, "expired-outsider")
    room = _room(client, sqlite_session, host, "invite_only", "expired-room")
    issued = _invite(client, sqlite_session, host, room["id"])

    stored = sqlite_session.get(RoomInvite, issued["id"])
    assert stored is not None
    stored.expires_at = utc_now() - timedelta(seconds=1)
    sqlite_session.add(stored)
    sqlite_session.commit()

    denied = client.post(
        "/rooms/invites/join",
        headers=_headers(sqlite_session, outsider),
        json={"token": issued["token"]},
    )
    assert denied.status_code == 404


def test_private_room_host_adds_verified_account_by_email(client, sqlite_session: Session):
    host = _user(sqlite_session, "private-host")
    member = _user(sqlite_session, "private-member")
    room = _room(client, sqlite_session, host, "private", "private-room")

    generic = client.post(
        f"/rooms/{room['id']}/join",
        headers=_headers(sqlite_session, member),
    )
    assert generic.status_code == 404
    assert generic.json()["detail"] == "Room not found"

    added = client.post(
        f"/rooms/{room['id']}/members/add",
        headers=_headers(sqlite_session, host),
        json={"email": member.email},
    )
    assert added.status_code == 200
    assert added.json()["user_id"] == member.id
    assert added.json()["display_name"] == member.display_name
    assert added.json()["status"] == "active"

    detail = client.get(
        f"/rooms/{room['id']}",
        headers=_headers(sqlite_session, member),
    )
    assert detail.status_code == 200
    assert detail.json()["current_user_role"] == "member"


def test_private_room_rejects_unverified_direct_member(client, sqlite_session: Session):
    host = _user(sqlite_session, "unverified-host")
    member = _user(sqlite_session, "unverified-member", verified=False)
    room = _room(client, sqlite_session, host, "private", "unverified-room")

    response = client.post(
        f"/rooms/{room['id']}/members/add",
        headers=_headers(sqlite_session, host),
        json={"email": member.email},
    )
    assert response.status_code == 422
    assert "verify" in response.json()["detail"].lower()


def test_only_invite_only_rooms_can_issue_invite_links(client, sqlite_session: Session):
    host = _user(sqlite_session, "mode-host")
    private_room = _room(client, sqlite_session, host, "private", "mode-private")
    public_room = _room(client, sqlite_session, host, "public", "mode-public")

    for room in (private_room, public_room):
        response = client.post(
            f"/rooms/{room['id']}/invites",
            headers=_headers(sqlite_session, host),
            json={"expires_in_hours": 24},
        )
        assert response.status_code == 409


def test_host_removal_kicks_live_socket_and_member_cannot_reconnect(
    client, sqlite_session: Session
):
    host = _user(sqlite_session, "kick-host")
    member = _user(sqlite_session, "kick-member")
    room = _room(client, sqlite_session, host, "private", "kick-room")
    host_headers = _headers(sqlite_session, host)
    member_headers = _headers(sqlite_session, member)

    added = client.post(
        f"/rooms/{room['id']}/members/add",
        headers=host_headers,
        json={"email": member.email},
    )
    assert added.status_code == 200

    host_ticket = client.post(
        f"/rooms/{room['id']}/ws-ticket", headers=host_headers
    ).json()["ticket"]
    member_ticket = client.post(
        f"/rooms/{room['id']}/ws-ticket", headers=member_headers
    ).json()["ticket"]

    with client.websocket_connect(
        f"/rooms/{room['id']}/ws?ticket={host_ticket}"
    ) as host_ws:
        assert host_ws.receive_json()["type"] == "room.snapshot"
        assert host_ws.receive_json()["type"] == "presence.joined"

        with client.websocket_connect(
            f"/rooms/{room['id']}/ws?ticket={member_ticket}"
        ) as member_ws:
            assert member_ws.receive_json()["type"] == "room.snapshot"
            assert host_ws.receive_json()["type"] == "presence.joined"
            assert member_ws.receive_json()["type"] == "presence.joined"

            removed = client.post(
                f"/rooms/{room['id']}/members/{member.id}/remove",
                headers=host_headers,
            )
            assert removed.status_code == 200
            assert removed.json()["status"] == "removed"

            presence_left = host_ws.receive_json()
            assert presence_left["type"] == "presence.left"
            assert presence_left["payload"]["user"]["user_id"] == member.id
            assert [person["user_id"] for person in presence_left["payload"]["presence"]] == [host.id]

            with pytest.raises(WebSocketDisconnect):
                member_ws.receive_json()

    membership = sqlite_session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room["id"],
            RoomMember.user_id == member.id,
        )
    ).one()
    assert membership.status == "removed"

    ticket_denied = client.post(
        f"/rooms/{room['id']}/ws-ticket",
        headers=member_headers,
    )
    assert ticket_denied.status_code == 403


def test_non_host_cannot_issue_invite_or_remove_member(client, sqlite_session: Session):
    host = _user(sqlite_session, "permission-host")
    member = _user(sqlite_session, "permission-member")
    room = _room(client, sqlite_session, host, "invite_only", "permission-room")
    issued = _invite(client, sqlite_session, host, room["id"])

    joined = client.post(
        "/rooms/invites/join",
        headers=_headers(sqlite_session, member),
        json={"token": issued["token"]},
    )
    assert joined.status_code == 200
    member_headers = _headers(sqlite_session, member)

    denied_invite = client.post(
        f"/rooms/{room['id']}/invites",
        headers=member_headers,
        json={"expires_in_hours": 24},
    )
    assert denied_invite.status_code == 403

    denied_remove = client.post(
        f"/rooms/{room['id']}/members/{host.id}/remove",
        headers=member_headers,
    )
    assert denied_remove.status_code == 403
