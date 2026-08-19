"""Quest Room REST boundaries for membership, privacy, and invite capabilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Deck, User, utc_now
from ..room_models import (
    ROOM_VISIBILITIES,
    InviteJoinRequest,
    PrivateMemberAddRequest,
    RoomCreate,
    RoomInvite,
    RoomInviteCreate,
    RoomInviteIssued,
    RoomInviteRead,
    RoomMember,
    RoomMemberRead,
    RoomRead,
    StudyRoom,
)
from ..room_realtime import event_envelope, room_connections
from ..security import get_current_user, hash_token, new_token, require_verified_user

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _clean_name(value: str) -> str:
    name = " ".join(value.strip().split())
    if not name:
        raise HTTPException(status_code=422, detail="Room name cannot be empty")
    if len(name) > 80:
        raise HTTPException(status_code=422, detail="Room name must be 80 characters or fewer")
    return name


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _room_or_404(session: Session, room_id: int) -> StudyRoom:
    room = session.get(StudyRoom, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def _active_member(session: Session, room_id: int, user_id: int) -> RoomMember | None:
    return session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id,
            RoomMember.status == "active",
        )
    ).first()


def _any_membership(session: Session, room_id: int, user_id: int) -> RoomMember | None:
    return session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id,
        )
    ).first()


def _member_count(session: Session, room_id: int) -> int:
    count = session.exec(
        select(func.count())
        .select_from(RoomMember)
        .where(RoomMember.room_id == room_id, RoomMember.status == "active")
    ).one()
    return int(count or 0)


def _read_room(session: Session, room: StudyRoom, user_id: int) -> RoomRead:
    membership = _active_member(session, int(room.id or 0), user_id)
    return RoomRead(
        id=int(room.id or 0),
        host_user_id=room.host_user_id,
        deck_id=room.deck_id,
        name=room.name,
        visibility=room.visibility,
        status=room.status,
        created_at=room.created_at,
        updated_at=room.updated_at,
        closed_at=room.closed_at,
        member_count=_member_count(session, int(room.id or 0)),
        current_user_role=membership.role if membership is not None else None,
    )


def _read_member(session: Session, member: RoomMember) -> RoomMemberRead:
    account = session.get(User, member.user_id)
    return RoomMemberRead(
        id=int(member.id or 0),
        room_id=member.room_id,
        user_id=member.user_id,
        role=member.role,
        status=member.status,
        joined_at=member.joined_at,
        last_seen_at=member.last_seen_at,
        display_name=account.display_name if account is not None else None,
    )


def _invite_active(invite: RoomInvite) -> bool:
    return invite.revoked_at is None and _aware_utc(invite.expires_at) > utc_now()


def _read_invite(invite: RoomInvite) -> RoomInviteRead:
    return RoomInviteRead(
        id=int(invite.id or 0),
        room_id=invite.room_id,
        created_by_user_id=invite.created_by_user_id,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
        revoked_at=invite.revoked_at,
        use_count=invite.use_count,
        last_used_at=invite.last_used_at,
        active=_invite_active(invite),
    )


def _deck_for_room(
    session: Session,
    *,
    deck_id: int,
    user_id: int,
    room_visibility: str,
) -> Deck:
    deck = session.get(Deck, deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")

    owns_deck = deck.owner_id == user_id and not deck.is_builtin
    shareable = deck.is_builtin or deck.visibility in {"public", "unlisted"}
    if not owns_deck and not shareable:
        raise HTTPException(status_code=403, detail="You cannot create a room for this deck")

    # A room must never widen the discoverability of its backing deck.
    if room_visibility == "public" and not (deck.is_builtin or deck.visibility == "public"):
        raise HTTPException(
            status_code=422,
            detail="Public rooms require an Official or public deck",
        )
    return deck


def _require_member(session: Session, room: StudyRoom, user_id: int) -> RoomMember:
    membership = _active_member(session, int(room.id or 0), user_id)
    if membership is None:
        raise HTTPException(status_code=403, detail="Active room membership required")
    return membership


def _require_host(session: Session, room: StudyRoom, user_id: int) -> RoomMember:
    membership = _require_member(session, room, user_id)
    if membership.role != "host" or room.host_user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the room host can do that")
    return membership


def _activate_membership(
    session: Session,
    room: StudyRoom,
    user_id: int,
    *,
    allow_restore_removed: bool,
) -> RoomMember:
    """Create/reactivate one durable membership under an already-authorized flow."""
    existing = _any_membership(session, int(room.id or 0), user_id)
    if existing is not None:
        if existing.status == "removed" and not allow_restore_removed:
            raise HTTPException(status_code=403, detail="Membership was removed")
        existing.status = "active"
        existing.role = "member" if existing.role != "host" else existing.role
        existing.removed_at = None
        existing.last_seen_at = utc_now()
        session.add(existing)
        return existing

    membership = RoomMember(
        room_id=int(room.id or 0),
        user_id=user_id,
        role="member",
        status="active",
    )
    session.add(membership)
    return membership


def _presence_payload(session: Session, user_ids: list[int]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for user_id in user_ids:
        account = session.get(User, user_id)
        if account is not None:
            rows.append({"user_id": user_id, "display_name": account.display_name})
    return rows


@router.post("", response_model=RoomRead, status_code=201)
def create_room(
    payload: RoomCreate,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> RoomRead:
    """Create a room and persist the creator as its host member."""
    visibility = payload.visibility.strip().lower()
    if visibility not in ROOM_VISIBILITIES:
        raise HTTPException(
            status_code=422,
            detail="Room visibility must be public, private, or invite_only",
        )
    name = _clean_name(payload.name)
    _deck_for_room(
        session,
        deck_id=payload.deck_id,
        user_id=int(user.id or 0),
        room_visibility=visibility,
    )

    room = StudyRoom(
        host_user_id=int(user.id or 0),
        deck_id=payload.deck_id,
        name=name,
        visibility=visibility,
        status="open",
    )
    session.add(room)
    session.flush()
    session.add(
        RoomMember(
            room_id=int(room.id or 0),
            user_id=int(user.id or 0),
            role="host",
            status="active",
        )
    )
    session.commit()
    session.refresh(room)
    return _read_room(session, room, int(user.id or 0))


@router.get("/mine", response_model=list[RoomRead])
def my_rooms(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RoomRead]:
    """Return rooms where the current account has active membership."""
    rows = session.exec(
        select(StudyRoom)
        .join(RoomMember, RoomMember.room_id == StudyRoom.id)
        .where(
            RoomMember.user_id == int(user.id or 0),
            RoomMember.status == "active",
        )
        .order_by(StudyRoom.updated_at.desc())
    ).all()
    return [_read_room(session, room, int(user.id or 0)) for room in rows]


@router.post("/invites/join", response_model=RoomRead)
def join_by_invite(
    payload: InviteJoinRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomRead:
    """Join an invite-only room with a valid opaque capability token."""
    raw = payload.token.strip()
    if len(raw) < 20:
        raise HTTPException(status_code=404, detail="Invite not found or unavailable")
    invite = session.exec(
        select(RoomInvite).where(RoomInvite.token_hash == hash_token(raw))
    ).first()
    if invite is None or not _invite_active(invite):
        raise HTTPException(status_code=404, detail="Invite not found or unavailable")

    room = session.get(StudyRoom, invite.room_id)
    if room is None or room.visibility != "invite_only":
        raise HTTPException(status_code=404, detail="Invite not found or unavailable")
    if room.status != "open":
        raise HTTPException(status_code=409, detail="Room is closed")

    user_id = int(user.id or 0)
    active = _active_member(session, int(room.id or 0), user_id)
    if active is not None:
        return _read_room(session, room, user_id)

    _activate_membership(
        session,
        room,
        user_id,
        allow_restore_removed=False,
    )
    now = utc_now()
    invite.use_count += 1
    invite.last_used_at = now
    room.updated_at = now
    session.add(invite)
    session.add(room)
    session.commit()
    return _read_room(session, room, user_id)


@router.get("/{room_id}", response_model=RoomRead)
def room_detail(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomRead:
    """Return a member room, or an open public room summary before joining."""
    room = _room_or_404(session, room_id)
    member = _active_member(session, room_id, int(user.id or 0))
    if member is None and not (room.visibility == "public" and room.status == "open"):
        # Hide private/invite-only room existence from non-members.
        raise HTTPException(status_code=404, detail="Room not found")
    return _read_room(session, room, int(user.id or 0))


@router.post("/{room_id}/join", response_model=RoomRead)
def join_room(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomRead:
    """Join an open public room. Invite/private membership is handled separately."""
    room = _room_or_404(session, room_id)
    if room.status != "open":
        raise HTTPException(status_code=409, detail="Room is closed")

    user_id = int(user.id or 0)
    current = _active_member(session, room_id, user_id)
    if current is not None:
        return _read_room(session, room, user_id)

    prior = _any_membership(session, room_id, user_id)
    if prior is not None:
        if prior.status == "removed":
            raise HTTPException(status_code=403, detail="Membership was removed")
        if prior.status == "left" and room.visibility == "public":
            _activate_membership(
                session,
                room,
                user_id,
                allow_restore_removed=False,
            )
            room.updated_at = utc_now()
            session.add(room)
            session.commit()
            return _read_room(session, room, user_id)

    if room.visibility != "public":
        raise HTTPException(status_code=403, detail="Invite or membership required")

    _activate_membership(
        session,
        room,
        user_id,
        allow_restore_removed=False,
    )
    room.updated_at = utc_now()
    session.add(room)
    session.commit()
    return _read_room(session, room, user_id)


@router.post("/{room_id}/leave", response_model=RoomRead)
def leave_room(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomRead:
    """Leave a room without deleting its durable membership history."""
    room = _room_or_404(session, room_id)
    membership = _require_member(session, room, int(user.id or 0))
    if membership.role == "host":
        raise HTTPException(status_code=409, detail="Host must close the room instead of leaving")

    membership.status = "left"
    membership.removed_at = utc_now()
    membership.last_seen_at = utc_now()
    room.updated_at = utc_now()
    session.add(membership)
    session.add(room)
    session.commit()
    return _read_room(session, room, int(user.id or 0))


@router.post("/{room_id}/close", response_model=RoomRead)
def close_room(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomRead:
    """Close a room as its host; closed rooms reject new joins."""
    room = _room_or_404(session, room_id)
    _require_host(session, room, int(user.id or 0))
    if room.status != "closed":
        now = utc_now()
        room.status = "closed"
        room.closed_at = now
        room.updated_at = now
        session.add(room)
        session.commit()
        session.refresh(room)
    return _read_room(session, room, int(user.id or 0))


@router.post("/{room_id}/invites", response_model=RoomInviteIssued, status_code=201)
def create_room_invite(
    room_id: int,
    payload: RoomInviteCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomInviteIssued:
    """Issue an expiring reusable invite for an invite-only room."""
    room = _room_or_404(session, room_id)
    _require_host(session, room, int(user.id or 0))
    if room.status != "open":
        raise HTTPException(status_code=409, detail="Room is closed")
    if room.visibility != "invite_only":
        raise HTTPException(status_code=409, detail="Only invite-only rooms use invite links")

    raw = new_token()
    invite = RoomInvite(
        room_id=room_id,
        created_by_user_id=int(user.id or 0),
        token_hash=hash_token(raw),
        expires_at=utc_now() + timedelta(hours=payload.expires_in_hours),
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    read = _read_invite(invite)
    return RoomInviteIssued(**read.model_dump(), token=raw)


@router.get("/{room_id}/invites", response_model=list[RoomInviteRead])
def list_room_invites(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RoomInviteRead]:
    """List invite metadata to the room host without ever returning raw tokens."""
    room = _room_or_404(session, room_id)
    _require_host(session, room, int(user.id or 0))
    rows = session.exec(
        select(RoomInvite)
        .where(RoomInvite.room_id == room_id)
        .order_by(RoomInvite.created_at.desc())
    ).all()
    return [_read_invite(invite) for invite in rows]


@router.post("/{room_id}/invites/{invite_id}/revoke", response_model=RoomInviteRead)
def revoke_room_invite(
    room_id: int,
    invite_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomInviteRead:
    """Revoke one invite capability immediately."""
    room = _room_or_404(session, room_id)
    _require_host(session, room, int(user.id or 0))
    invite = session.get(RoomInvite, invite_id)
    if invite is None or invite.room_id != room_id:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.revoked_at is None:
        invite.revoked_at = utc_now()
        session.add(invite)
        session.commit()
        session.refresh(invite)
    return _read_invite(invite)


@router.get("/{room_id}/members", response_model=list[RoomMemberRead])
def room_members(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RoomMemberRead]:
    """Return active membership to current room members only."""
    room = _room_or_404(session, room_id)
    _require_member(session, room, int(user.id or 0))
    rows = session.exec(
        select(RoomMember)
        .where(RoomMember.room_id == room_id, RoomMember.status == "active")
        .order_by(RoomMember.joined_at.asc())
    ).all()
    return [_read_member(session, member) for member in rows]


@router.post("/{room_id}/members/add", response_model=RoomMemberRead)
def add_private_room_member(
    room_id: int,
    payload: PrivateMemberAddRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomMemberRead:
    """Explicitly add a verified existing account to a private room."""
    room = _room_or_404(session, room_id)
    _require_host(session, room, int(user.id or 0))
    if room.status != "open":
        raise HTTPException(status_code=409, detail="Room is closed")
    if room.visibility != "private":
        raise HTTPException(status_code=409, detail="Direct member adds are for private rooms")

    normalized_email = str(payload.email).strip().lower()
    target = session.exec(
        select(User).where(func.lower(User.email) == normalized_email)
    ).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if not target.is_verified:
        raise HTTPException(status_code=422, detail="Member must verify their email first")

    membership = _active_member(session, room_id, int(target.id or 0))
    if membership is None:
        membership = _activate_membership(
            session,
            room,
            int(target.id or 0),
            allow_restore_removed=True,
        )
        room.updated_at = utc_now()
        session.add(room)
        session.commit()
        session.refresh(membership)
    return _read_member(session, membership)


@router.post("/{room_id}/members/{target_user_id}/remove", response_model=RoomMemberRead)
async def remove_room_member(
    room_id: int,
    target_user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoomMemberRead:
    """Remove a member and revoke every live room socket immediately."""
    room = _room_or_404(session, room_id)
    _require_host(session, room, int(user.id or 0))
    if target_user_id == room.host_user_id:
        raise HTTPException(status_code=409, detail="The room host cannot remove themselves")

    membership = _active_member(session, room_id, target_user_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="Active member not found")

    now = utc_now()
    membership.status = "removed"
    membership.removed_at = now
    membership.last_seen_at = now
    room.updated_at = now
    session.add(membership)
    session.add(room)
    session.commit()
    session.refresh(membership)

    await room_connections.kick_user(room_id, target_user_id)
    online_ids = await room_connections.online_user_ids(room_id)
    target = session.get(User, target_user_id)
    await room_connections.broadcast(
        room_id,
        event_envelope(
            room_id,
            "presence.left",
            {
                "user": {
                    "user_id": target_user_id,
                    "display_name": target.display_name if target is not None else "Removed member",
                },
                "presence": _presence_payload(session, online_ids),
            },
        ),
    )
    return _read_member(session, membership)
