"""Quest Room moderation report, block, and human review coverage."""

from sqlmodel import Session, select

from app.config import settings
from app.models import Deck, User
from app.moderation_models import ModerationAudit, ModerationReport, UserBlock
from app.room_models import RoomMessage
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str) -> User:
    user = User(
        email=f"moderation-{suffix}@example.com",
        display_name=f"Moderation {suffix.title()}",
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


def _deck(session: Session, host: User, slug: str) -> Deck:
    deck = Deck(
        owner_id=host.id,
        title=f"Moderation Deck {slug}",
        slug=slug,
        description="Moderation test deck",
        is_builtin=False,
        subject="Testing",
        difficulty="beginner",
        visibility="public",
        tags=["moderation"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return deck


def _room(client, session: Session, host: User, slug: str) -> dict:
    deck = _deck(session, host, slug)
    response = client.post(
        "/rooms",
        headers=_headers(session, host),
        json={
            "deck_id": int(deck.id or 0),
            "name": f"Moderation Room {slug}",
            "visibility": "public",
        },
    )
    assert response.status_code == 201
    return response.json()


def _join(client, session: Session, room_id: int, user: User) -> None:
    response = client.post(f"/rooms/{room_id}/join", headers=_headers(session, user))
    assert response.status_code == 200


def test_message_report_snapshots_context_for_later_review(client, sqlite_session: Session):
    host = _user(sqlite_session, "report-host")
    reporter = _user(sqlite_session, "reporter")
    target = _user(sqlite_session, "report-target")
    room = _room(client, sqlite_session, host, "report")
    _join(client, sqlite_session, room["id"], reporter)
    _join(client, sqlite_session, room["id"], target)

    message = RoomMessage(
        room_id=room["id"],
        user_id=int(target.id or 0),
        kind="chat",
        body="Context that should survive later message removal",
    )
    sqlite_session.add(message)
    sqlite_session.commit()
    sqlite_session.refresh(message)

    response = client.post(
        f"/moderation/rooms/{room['id']}/reports",
        headers=_headers(sqlite_session, reporter),
        json={
            "kind": "message",
            "message_id": message.id,
            "reason": "harassment",
            "details": "Repeated unwanted comments",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["kind"] == "message"
    assert payload["target_user_id"] == target.id
    assert payload["message_author_user_id"] == target.id
    assert payload["message_body_snapshot"] == message.body
    assert payload["target_display_name_snapshot"] == target.display_name
    assert payload["room_name_snapshot"] == room["name"]
    assert payload["status"] == "open"


def test_room_and_user_reports_validate_targets(client, sqlite_session: Session):
    host = _user(sqlite_session, "target-host")
    reporter = _user(sqlite_session, "target-reporter")
    target = _user(sqlite_session, "target-member")
    stranger = _user(sqlite_session, "target-stranger")
    room = _room(client, sqlite_session, host, "targets")
    _join(client, sqlite_session, room["id"], reporter)
    _join(client, sqlite_session, room["id"], target)
    headers = _headers(sqlite_session, reporter)

    room_report = client.post(
        f"/moderation/rooms/{room['id']}/reports",
        headers=headers,
        json={"kind": "room", "reason": "spam"},
    )
    assert room_report.status_code == 201
    assert room_report.json()["target_user_id"] is None

    user_report = client.post(
        f"/moderation/rooms/{room['id']}/reports",
        headers=headers,
        json={
            "kind": "user",
            "target_user_id": target.id,
            "reason": "abuse",
        },
    )
    assert user_report.status_code == 201
    assert user_report.json()["target_display_name_snapshot"] == target.display_name

    outsider = client.post(
        f"/moderation/rooms/{room['id']}/reports",
        headers=headers,
        json={
            "kind": "user",
            "target_user_id": stranger.id,
            "reason": "abuse",
        },
    )
    assert outsider.status_code == 404


def test_non_member_cannot_report_hidden_room_context(client, sqlite_session: Session):
    host = _user(sqlite_session, "nonmember-host")
    outsider = _user(sqlite_session, "nonmember-outsider")
    room = _room(client, sqlite_session, host, "nonmember")

    response = client.post(
        f"/moderation/rooms/{room['id']}/reports",
        headers=_headers(sqlite_session, outsider),
        json={"kind": "room", "reason": "spam"},
    )
    assert response.status_code == 403


def test_block_requires_shared_room_and_is_idempotent(client, sqlite_session: Session):
    host = _user(sqlite_session, "block-host")
    blocker = _user(sqlite_session, "blocker")
    target = _user(sqlite_session, "blocked")
    stranger = _user(sqlite_session, "block-stranger")
    room = _room(client, sqlite_session, host, "blocks")
    _join(client, sqlite_session, room["id"], blocker)
    _join(client, sqlite_session, room["id"], target)
    headers = _headers(sqlite_session, blocker)

    first = client.post(f"/moderation/blocks/{target.id}", headers=headers)
    second = client.post(f"/moderation/blocks/{target.id}", headers=headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["display_name"] == target.display_name

    rows = sqlite_session.exec(
        select(UserBlock).where(UserBlock.blocker_user_id == blocker.id)
    ).all()
    assert len(rows) == 1

    denied = client.post(f"/moderation/blocks/{stranger.id}", headers=headers)
    assert denied.status_code == 404

    listed = client.get("/moderation/blocks", headers=headers)
    assert listed.status_code == 200
    assert [item["user_id"] for item in listed.json()] == [target.id]

    unblocked = client.delete(f"/moderation/blocks/{target.id}", headers=headers)
    assert unblocked.status_code == 204
    assert client.get("/moderation/blocks", headers=headers).json() == []


def test_moderator_queue_is_server_gated_and_review_is_audited(
    client, sqlite_session: Session, monkeypatch
):
    host = _user(sqlite_session, "review-host")
    reporter = _user(sqlite_session, "review-reporter")
    moderator = _user(sqlite_session, "review-moderator")
    room = _room(client, sqlite_session, host, "review")
    _join(client, sqlite_session, room["id"], reporter)

    created = client.post(
        f"/moderation/rooms/{room['id']}/reports",
        headers=_headers(sqlite_session, reporter),
        json={"kind": "room", "reason": "spam", "details": "Automated link flood"},
    ).json()

    denied = client.get(
        "/moderation/reports",
        headers=_headers(sqlite_session, reporter),
    )
    assert denied.status_code == 403

    monkeypatch.setattr(settings, "MODERATOR_EMAILS", moderator.email)
    moderator_headers = _headers(sqlite_session, moderator)
    capability = client.get("/moderation/capabilities", headers=moderator_headers)
    assert capability.status_code == 200
    assert capability.json()["moderator"] is True

    queue = client.get("/moderation/reports", headers=moderator_headers)
    assert queue.status_code == 200
    assert [report["id"] for report in queue.json()] == [created["id"]]

    reviewed = client.post(
        f"/moderation/reports/{created['id']}/review",
        headers=moderator_headers,
        json={"status": "actioned", "note": "Reviewed and room host contacted"},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "actioned"
    assert reviewed.json()["reviewed_by_user_id"] == moderator.id

    report = sqlite_session.get(ModerationReport, created["id"])
    assert report is not None
    assert report.review_note == "Reviewed and room host contacted"

    audit = sqlite_session.exec(
        select(ModerationAudit).where(ModerationAudit.report_id == created["id"])
    ).one()
    assert audit.action == "report_actioned"
    assert audit.actor_user_id == moderator.id
    assert audit.room_id == room["id"]


def test_my_reports_returns_only_current_reporter(client, sqlite_session: Session):
    host = _user(sqlite_session, "mine-host")
    first = _user(sqlite_session, "mine-first")
    second = _user(sqlite_session, "mine-second")
    room = _room(client, sqlite_session, host, "mine")
    _join(client, sqlite_session, room["id"], first)
    _join(client, sqlite_session, room["id"], second)

    for reporter, reason in ((first, "spam"), (second, "abuse")):
        response = client.post(
            f"/moderation/rooms/{room['id']}/reports",
            headers=_headers(sqlite_session, reporter),
            json={"kind": "room", "reason": reason},
        )
        assert response.status_code == 201

    mine = client.get(
        "/moderation/reports/mine",
        headers=_headers(sqlite_session, first),
    )
    assert mine.status_code == 200
    assert len(mine.json()) == 1
    assert mine.json()[0]["reporter_user_id"] == first.id
