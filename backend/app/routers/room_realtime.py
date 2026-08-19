"""Realtime Quest Room transport for chat, presence, and synchronized Arcade."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from ..activities import ActivityCard, ActivityType
from ..db import get_session
from ..models import Card, User, utc_now
from ..room_arcade import (
    end_room_activity,
    next_room_activity_round,
    reveal_room_activity,
    room_activity_payload,
    start_room_activity,
    submit_room_activity_response,
)
from ..room_models import RoomMessage, RoomMessageRead, StudyRoom, WsTicketResponse
from ..room_realtime import (
    MESSAGE_MAX_LENGTH,
    WS_TICKET_TTL_SECONDS,
    consume_ws_ticket,
    event_envelope,
    issue_ws_ticket,
    message_rate_limiter,
    room_connections,
)
from ..security import get_current_user
from .rooms import _active_member, _require_member, _room_or_404

router = APIRouter(prefix="/rooms", tags=["room-realtime"])


def _message_payload(session: Session, message: RoomMessage) -> dict[str, Any]:
    user = session.get(User, message.user_id)
    return {
        "id": int(message.id or 0),
        "room_id": message.room_id,
        "user_id": message.user_id,
        "author_display_name": user.display_name if user is not None else "Unknown learner",
        "kind": message.kind,
        "body": message.body,
        "card_id": message.card_id,
        "created_at": message.created_at.isoformat(),
    }


def _message_read(session: Session, message: RoomMessage) -> RoomMessageRead:
    payload = _message_payload(session, message)
    return RoomMessageRead(**payload)


def _recent_messages(
    session: Session,
    room_id: int,
    *,
    limit: int = 50,
    before_id: int | None = None,
) -> list[RoomMessage]:
    query = select(RoomMessage).where(
        RoomMessage.room_id == room_id,
        RoomMessage.removed_at.is_(None),
    )
    if before_id is not None:
        query = query.where(RoomMessage.id < before_id)
    rows = session.exec(query.order_by(RoomMessage.id.desc()).limit(limit)).all()
    return list(reversed(rows))


def _presence_payload(session: Session, user_ids: list[int]) -> list[dict[str, Any]]:
    presence: list[dict[str, Any]] = []
    for user_id in user_ids:
        user = session.get(User, user_id)
        if user is None:
            continue
        presence.append({"user_id": user_id, "display_name": user.display_name})
    return presence


def _activity_cards(session: Session, deck_id: int) -> list[ActivityCard]:
    """Load one room's deck through the same transport-neutral Arcade card shape."""
    cards = session.exec(select(Card).where(Card.deck_id == deck_id).order_by(Card.id)).all()
    return [
        ActivityCard(
            id=int(card.id or 0),
            word=card.word,
            definition=card.definition,
            domain=card.domain,
            kind=card.kind,
        )
        for card in cards
    ]


async def _send_error(websocket: WebSocket, room_id: int, message: str) -> None:
    await websocket.send_json(event_envelope(room_id, "error", {"message": message}))


@router.post("/{room_id}/ws-ticket", response_model=WsTicketResponse)
def room_ws_ticket(
    room_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> WsTicketResponse:
    """Issue a short-lived one-use ticket to an active room member."""
    room = _room_or_404(session, room_id)
    if room.status != "open":
        raise HTTPException(status_code=409, detail="Room is closed")
    _require_member(session, room, int(user.id or 0))
    raw = issue_ws_ticket(room_id, int(user.id or 0))
    return WsTicketResponse(ticket=raw, expires_in_seconds=WS_TICKET_TTL_SECONDS)


@router.get("/{room_id}/messages", response_model=list[RoomMessageRead])
def room_message_history(
    room_id: int,
    limit: int = Query(50, ge=1, le=100),
    before_id: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RoomMessageRead]:
    """Return durable chronological history to active room members."""
    room = _room_or_404(session, room_id)
    _require_member(session, room, int(user.id or 0))
    return [
        _message_read(session, message)
        for message in _recent_messages(
            session,
            room_id,
            limit=limit,
            before_id=before_id,
        )
    ]


@router.websocket("/{room_id}/ws")
async def room_websocket(
    websocket: WebSocket,
    room_id: int,
    ticket: str = Query(...),
    session: Session = Depends(get_session),
) -> None:
    """Connect one authenticated member for presence, chat, and shared Arcade."""
    capability = consume_ws_ticket(ticket, room_id)
    if capability is None:
        await websocket.close(code=4401)
        return

    room = session.get(StudyRoom, room_id)
    member = _active_member(session, room_id, capability.user_id)
    user = session.get(User, capability.user_id)
    if room is None or room.status != "open" or member is None or user is None:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    first_connection = await room_connections.connect(
        room_id,
        capability.user_id,
        websocket,
    )
    member.last_seen_at = utc_now()
    session.add(member)
    session.commit()

    online_ids = await room_connections.online_user_ids(room_id)
    snapshot = event_envelope(
        room_id,
        "room.snapshot",
        {
            "self_user_id": capability.user_id,
            "messages": [
                _message_payload(session, message)
                for message in _recent_messages(session, room_id, limit=50)
            ],
            "presence": _presence_payload(session, online_ids),
            "activity": room_activity_payload(room_id),
        },
    )
    await websocket.send_json(snapshot)

    if first_connection:
        await room_connections.broadcast(
            room_id,
            event_envelope(
                room_id,
                "presence.joined",
                {
                    "user": {
                        "user_id": capability.user_id,
                        "display_name": user.display_name,
                    },
                    "presence": _presence_payload(session, online_ids),
                },
            ),
        )

    try:
        while True:
            incoming = await websocket.receive_json()
            if not isinstance(incoming, dict):
                await _send_error(websocket, room_id, "Invalid event")
                continue

            event_type = str(incoming.get("type") or "")
            if event_type == "ping":
                await websocket.send_json(event_envelope(room_id, "pong", {}))
                continue

            # Every mutation re-checks durable membership. A removed member cannot
            # keep chatting or playing merely because their socket was opened earlier.
            session.expire_all()
            current_room = session.get(StudyRoom, room_id)
            current_member = _active_member(session, room_id, capability.user_id)
            if (
                current_room is None
                or current_room.status != "open"
                or current_member is None
            ):
                await _send_error(websocket, room_id, "Active room membership required")
                await websocket.close(code=4403)
                return

            payload = incoming.get("payload")
            payload = payload if isinstance(payload, dict) else {}

            if event_type == "chat.send":
                body = " ".join(str(payload.get("body") or "").strip().split())
                if not body:
                    await _send_error(websocket, room_id, "Message cannot be empty")
                    continue
                if len(body) > MESSAGE_MAX_LENGTH:
                    await _send_error(
                        websocket,
                        room_id,
                        f"Message must be {MESSAGE_MAX_LENGTH} characters or fewer",
                    )
                    continue
                if not message_rate_limiter.allow(room_id, capability.user_id):
                    await _send_error(
                        websocket,
                        room_id,
                        "You're sending messages too quickly",
                    )
                    continue

                message = RoomMessage(
                    room_id=room_id,
                    user_id=capability.user_id,
                    kind="chat",
                    body=body,
                )
                current_member.last_seen_at = utc_now()
                current_room.updated_at = utc_now()
                session.add(message)
                session.add(current_member)
                session.add(current_room)
                session.commit()
                session.refresh(message)

                await room_connections.broadcast(
                    room_id,
                    event_envelope(
                        room_id,
                        "message.created",
                        {"message": _message_payload(session, message)},
                    ),
                )
                continue

            if event_type == "activity.sync":
                activity = room_activity_payload(room_id)
                await websocket.send_json(
                    event_envelope(
                        room_id,
                        "activity.state",
                        {"activity": activity},
                    )
                )
                continue

            if event_type == "activity.start":
                if current_member.role != "host":
                    await _send_error(websocket, room_id, "Only the room host can start Arcade")
                    continue
                try:
                    activity_type = ActivityType(str(payload.get("activity_type") or ""))
                    round_count = int(payload.get("round_count") or 5)
                    if round_count < 1 or round_count > 20:
                        raise ValueError("Round count must be between 1 and 20")
                    activity = start_room_activity(
                        room_id=room_id,
                        deck_id=current_room.deck_id,
                        cards=_activity_cards(session, current_room.deck_id),
                        activity_type=activity_type,
                        round_count=round_count,
                    )
                except (TypeError, ValueError) as exc:
                    await _send_error(websocket, room_id, str(exc))
                    continue
                await room_connections.broadcast(
                    room_id,
                    event_envelope(room_id, "activity.started", {"activity": activity}),
                )
                continue

            if event_type == "activity.submit":
                try:
                    activity = submit_room_activity_response(
                        room_id=room_id,
                        user_id=capability.user_id,
                        payload=payload,
                    )
                except ValueError as exc:
                    await _send_error(websocket, room_id, str(exc))
                    continue
                state = activity["state"]
                await room_connections.broadcast(
                    room_id,
                    event_envelope(
                        room_id,
                        "activity.submitted",
                        {
                            "session_id": state["session_id"],
                            "round_index": state["round_index"],
                            "user_id": capability.user_id,
                            "submitted_user_ids": activity["submitted_user_ids"],
                            "submitted_count": activity["submitted_count"],
                        },
                    ),
                )
                continue

            if event_type in {"activity.reveal", "activity.next", "activity.end"}:
                if current_member.role != "host":
                    await _send_error(
                        websocket,
                        room_id,
                        "Only the room host can control the Arcade round",
                    )
                    continue
                try:
                    if event_type == "activity.reveal":
                        activity = reveal_room_activity(room_id)
                        outgoing_type = "activity.state"
                    elif event_type == "activity.next":
                        activity = next_room_activity_round(room_id)
                        outgoing_type = (
                            "activity.completed"
                            if activity["state"]["phase"] == "complete"
                            else "activity.state"
                        )
                    else:
                        activity = end_room_activity(room_id)
                        outgoing_type = "activity.completed"
                except ValueError as exc:
                    await _send_error(websocket, room_id, str(exc))
                    continue
                await room_connections.broadcast(
                    room_id,
                    event_envelope(room_id, outgoing_type, {"activity": activity}),
                )
                continue

            await _send_error(websocket, room_id, "Unsupported room event")
    except WebSocketDisconnect:
        pass
    finally:
        last_connection = await room_connections.disconnect(
            room_id,
            capability.user_id,
            websocket,
        )
        membership = _active_member(session, room_id, capability.user_id)
        if membership is not None:
            membership.last_seen_at = utc_now()
            session.add(membership)
            session.commit()
        if last_connection:
            online_ids = await room_connections.online_user_ids(room_id)
            await room_connections.broadcast(
                room_id,
                event_envelope(
                    room_id,
                    "presence.left",
                    {
                        "user": {
                            "user_id": capability.user_id,
                            "display_name": user.display_name,
                        },
                        "presence": _presence_payload(session, online_ids),
                    },
                ),
            )
