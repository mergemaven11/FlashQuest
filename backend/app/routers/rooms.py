"""Quest Room REST foundation: ownership, membership, and deck privacy boundaries."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Deck, User, utc_now
from ..room_models import (
    ROOM_VISIBILITIES,
    RoomCreate,
    RoomMember,
    RoomMemberRead,
    RoomRead,
    StudyRoom,
)
from ..security import get_current_user, require_verified_user

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _clean_name(value: str) -> str:
    name = " ".join(value.strip().split())
    if not name:
        raise HTTPException(status_code=422, detail="Room name cannot be empty")
    if len(name) > 80:
        raise HTTPException(status_code=422, detail="Room name must be 80 characters or fewer")
    return name


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

    current = _active_member(session, room_id, int(user.id or 0))
    if current is not None:
        return _read_room(session, room, int(user.id or 0))

    prior = _any_membership(session, room_id, int(user.id or 0))
    if prior is not None:
        if prior.status == "removed":
            raise HTTPException(status_code=403, detail="Membership was removed")
        if prior.status == "left" and room.visibility == "public":
            prior.status = "active"
            prior.removed_at = None
            prior.last_seen_at = utc_now()
            session.add(prior)
            session.commit()
            return _read_room(session, room, int(user.id or 0))

    if room.visibility != "public":
        raise HTTPException(status_code=403, detail="Invite or membership required")

    session.add(
        RoomMember(
            room_id=room_id,
            user_id=int(user.id or 0),
            role="member",
            status="active",
        )
    )
    room.updated_at = utc_now()
    session.add(room)
    session.commit()
    return _read_room(session, room, int(user.id or 0))


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
    return [
        RoomMemberRead(
            id=int(member.id or 0),
            room_id=member.room_id,
            user_id=member.user_id,
            role=member.role,
            status=member.status,
            joined_at=member.joined_at,
            last_seen_at=member.last_seen_at,
        )
        for member in rows
    ]
