"""Quest Room ownership, deck privacy, membership, and lifecycle tests."""

from sqlmodel import Session, select

from app.models import Deck, User
from app.room_models import RoomMember, RoomMessage, StudyRoom
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str, *, verified: bool = True) -> User:
    user = User(
        email=f"room-{suffix}@example.com",
        display_name=f"Room User {suffix.title()}",
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


def _deck(
    session: Session,
    *,
    slug: str,
    owner: User | None = None,
    visibility: str = "public",
    builtin: bool = False,
) -> Deck:
    deck = Deck(
        owner_id=None if builtin else (owner.id if owner is not None else None),
        title=f"Room Deck {slug}",
        slug=slug,
        description="Quest Room test deck",
        is_builtin=builtin,
        subject="Testing",
        difficulty="beginner",
        visibility="public" if builtin else visibility,
        tags=["rooms"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return deck


def _create_room(client, session: Session, host: User, deck: Deck, **overrides):
    payload = {
        "deck_id": int(deck.id or 0),
        "name": overrides.get("name", "Study Crew"),
        "visibility": overrides.get("visibility", "private"),
    }
    return client.post("/rooms", headers=_headers(session, host), json=payload)


def test_unverified_account_cannot_create_room(client, sqlite_session: Session):
    user = _user(sqlite_session, "unverified", verified=False)
    deck = _deck(sqlite_session, slug="public-for-unverified", visibility="public")

    response = _create_room(
        client,
        sqlite_session,
        user,
        deck,
        visibility="public",
    )
    assert response.status_code == 403
    assert "verify" in response.json()["detail"].lower()


def test_verified_host_creates_room_and_host_membership(client, sqlite_session: Session):
    host = _user(sqlite_session, "host")
    deck = _deck(sqlite_session, slug="public-host-deck", visibility="public")

    response = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
        name="  Platform   Crew  ",
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Platform Crew"
    assert payload["visibility"] == "public"
    assert payload["status"] == "open"
    assert payload["member_count"] == 1
    assert payload["current_user_role"] == "host"

    membership = sqlite_session.exec(
        select(RoomMember).where(RoomMember.room_id == payload["id"])
    ).one()
    assert membership.user_id == host.id
    assert membership.role == "host"
    assert membership.status == "active"


def test_public_room_cannot_widen_unlisted_deck_visibility(client, sqlite_session: Session):
    owner = _user(sqlite_session, "unlisted-owner")
    deck = _deck(
        sqlite_session,
        slug="unlisted-room-deck",
        owner=owner,
        visibility="unlisted",
    )

    response = _create_room(
        client,
        sqlite_session,
        owner,
        deck,
        visibility="public",
    )
    assert response.status_code == 422
    assert "public rooms require" in response.json()["detail"].lower()

    allowed = _create_room(
        client,
        sqlite_session,
        owner,
        deck,
        visibility="invite_only",
    )
    assert allowed.status_code == 201
    assert allowed.json()["visibility"] == "invite_only"


def test_non_owner_cannot_create_room_for_private_deck(client, sqlite_session: Session):
    owner = _user(sqlite_session, "private-owner")
    stranger = _user(sqlite_session, "private-stranger")
    deck = _deck(
        sqlite_session,
        slug="private-room-deck",
        owner=owner,
        visibility="private",
    )

    response = _create_room(
        client,
        sqlite_session,
        stranger,
        deck,
        visibility="private",
    )
    assert response.status_code == 403

    owner_response = _create_room(
        client,
        sqlite_session,
        owner,
        deck,
        visibility="private",
    )
    assert owner_response.status_code == 201


def test_authenticated_user_can_join_public_room_idempotently(client, sqlite_session: Session):
    host = _user(sqlite_session, "join-host")
    member = _user(sqlite_session, "join-member")
    deck = _deck(sqlite_session, slug="join-public", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
    ).json()
    headers = _headers(sqlite_session, member)

    first = client.post(f"/rooms/{room['id']}/join", headers=headers)
    second = client.post(f"/rooms/{room['id']}/join", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["member_count"] == 2
    assert second.json()["current_user_role"] == "member"

    rows = sqlite_session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room["id"], RoomMember.user_id == member.id
        )
    ).all()
    assert len(rows) == 1


def test_private_and_invite_rooms_reject_generic_join(client, sqlite_session: Session):
    host = _user(sqlite_session, "invite-host")
    stranger = _user(sqlite_session, "invite-stranger")
    deck = _deck(sqlite_session, slug="invite-public-deck", visibility="public")
    headers = _headers(sqlite_session, stranger)

    for visibility in ("private", "invite_only"):
        room = _create_room(
            client,
            sqlite_session,
            host,
            deck,
            visibility=visibility,
            name=f"{visibility} room",
        ).json()
        response = client.post(f"/rooms/{room['id']}/join", headers=headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "Room not found"


def test_private_room_is_not_enumerable_by_non_member(client, sqlite_session: Session):
    host = _user(sqlite_session, "hidden-host")
    stranger = _user(sqlite_session, "hidden-stranger")
    deck = _deck(sqlite_session, slug="hidden-public-deck", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="private",
    ).json()

    response = client.get(
        f"/rooms/{room['id']}", headers=_headers(sqlite_session, stranger)
    )
    assert response.status_code == 404


def test_public_room_summary_is_visible_before_join(client, sqlite_session: Session):
    host = _user(sqlite_session, "summary-host")
    stranger = _user(sqlite_session, "summary-stranger")
    deck = _deck(sqlite_session, slug="summary-public-deck", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
    ).json()

    response = client.get(
        f"/rooms/{room['id']}", headers=_headers(sqlite_session, stranger)
    )
    assert response.status_code == 200
    assert response.json()["current_user_role"] is None
    assert response.json()["member_count"] == 1


def test_non_host_cannot_close_room_and_closed_room_rejects_join(client, sqlite_session: Session):
    host = _user(sqlite_session, "close-host")
    member = _user(sqlite_session, "close-member")
    late = _user(sqlite_session, "close-late")
    deck = _deck(sqlite_session, slug="close-public", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
    ).json()

    member_headers = _headers(sqlite_session, member)
    assert client.post(f"/rooms/{room['id']}/join", headers=member_headers).status_code == 200
    denied = client.post(f"/rooms/{room['id']}/close", headers=member_headers)
    assert denied.status_code == 403

    closed = client.post(
        f"/rooms/{room['id']}/close", headers=_headers(sqlite_session, host)
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert closed.json()["closed_at"] is not None

    late_join = client.post(
        f"/rooms/{room['id']}/join", headers=_headers(sqlite_session, late)
    )
    assert late_join.status_code == 409


def test_member_can_leave_and_rejoin_public_room(client, sqlite_session: Session):
    host = _user(sqlite_session, "leave-host")
    member = _user(sqlite_session, "leave-member")
    deck = _deck(sqlite_session, slug="leave-public", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
    ).json()
    headers = _headers(sqlite_session, member)

    assert client.post(f"/rooms/{room['id']}/join", headers=headers).status_code == 200
    left = client.post(f"/rooms/{room['id']}/leave", headers=headers)
    assert left.status_code == 200
    assert left.json()["current_user_role"] is None
    assert left.json()["member_count"] == 1

    rejoined = client.post(f"/rooms/{room['id']}/join", headers=headers)
    assert rejoined.status_code == 200
    assert rejoined.json()["current_user_role"] == "member"
    assert rejoined.json()["member_count"] == 2


def test_removed_member_cannot_rejoin_public_room(client, sqlite_session: Session):
    host = _user(sqlite_session, "removed-host")
    member = _user(sqlite_session, "removed-member")
    deck = _deck(sqlite_session, slug="removed-public", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
    ).json()
    headers = _headers(sqlite_session, member)
    assert client.post(f"/rooms/{room['id']}/join", headers=headers).status_code == 200

    membership = sqlite_session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room["id"], RoomMember.user_id == member.id
        )
    ).one()
    membership.status = "removed"
    sqlite_session.add(membership)
    sqlite_session.commit()

    response = client.post(f"/rooms/{room['id']}/join", headers=headers)
    assert response.status_code == 403
    assert "removed" in response.json()["detail"].lower()


def test_my_rooms_only_lists_active_memberships(client, sqlite_session: Session):
    host = _user(sqlite_session, "mine-host")
    member = _user(sqlite_session, "mine-member")
    deck = _deck(sqlite_session, slug="mine-public", visibility="public")
    room = _create_room(
        client,
        sqlite_session,
        host,
        deck,
        visibility="public",
    ).json()
    headers = _headers(sqlite_session, member)

    assert client.post(f"/rooms/{room['id']}/join", headers=headers).status_code == 200
    mine = client.get("/rooms/mine", headers=headers)
    assert mine.status_code == 200
    assert [item["id"] for item in mine.json()] == [room["id"]]

    assert client.post(f"/rooms/{room['id']}/leave", headers=headers).status_code == 200
    assert client.get("/rooms/mine", headers=headers).json() == []


def test_room_message_model_is_durable_history_not_presence(sqlite_session: Session):
    host = _user(sqlite_session, "message-host")
    deck = _deck(sqlite_session, slug="message-deck", visibility="public")
    room = StudyRoom(
        host_user_id=int(host.id or 0),
        deck_id=int(deck.id or 0),
        name="Message Room",
        visibility="private",
    )
    sqlite_session.add(room)
    sqlite_session.commit()
    sqlite_session.refresh(room)

    message = RoomMessage(
        room_id=int(room.id or 0),
        user_id=int(host.id or 0),
        kind="chat",
        body="Persistent hello",
    )
    sqlite_session.add(message)
    sqlite_session.commit()
    sqlite_session.refresh(message)

    stored = sqlite_session.get(RoomMessage, message.id)
    assert stored is not None
    assert stored.body == "Persistent hello"
    assert not hasattr(stored, "is_online")
