"""Single-instance realtime primitives for Quest Rooms.

Tickets, presence, and rate-limit windows are intentionally ephemeral. Durable
membership and messages live in PostgreSQL. Before horizontally scaling the
realtime service, broadcasts must move behind shared pub/sub.
"""

from __future__ import annotations

import asyncio
import hashlib
import secrets
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from typing import Any

from fastapi import WebSocket

WS_TICKET_TTL_SECONDS = 45
MAX_WS_TICKETS = 2_000
MESSAGE_RATE_LIMIT = 8
MESSAGE_RATE_WINDOW_SECONDS = 10
MESSAGE_MAX_LENGTH = 1_000
EVENT_SCHEMA = "quest-room.v1"


@dataclass(frozen=True)
class RoomWsTicket:
    room_id: int
    user_id: int
    expires_at: float


_ticket_lock = Lock()
_tickets: dict[str, RoomWsTicket] = {}


def _ticket_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cleanup_tickets(now: float) -> None:
    expired = [key for key, value in _tickets.items() if value.expires_at <= now]
    for key in expired:
        _tickets.pop(key, None)
    if len(_tickets) <= MAX_WS_TICKETS:
        return
    oldest = sorted(_tickets.items(), key=lambda item: item[1].expires_at)
    for key, _value in oldest[: len(_tickets) - MAX_WS_TICKETS]:
        _tickets.pop(key, None)


def issue_ws_ticket(room_id: int, user_id: int) -> str:
    """Create a short-lived one-use opaque capability for one room socket."""
    raw = secrets.token_urlsafe(32)
    now = monotonic()
    with _ticket_lock:
        _cleanup_tickets(now)
        _tickets[_ticket_key(raw)] = RoomWsTicket(
            room_id=room_id,
            user_id=user_id,
            expires_at=now + WS_TICKET_TTL_SECONDS,
        )
    return raw


def consume_ws_ticket(raw: str, room_id: int) -> RoomWsTicket | None:
    """Atomically consume one ticket. Reuse, expiry, or room mismatch fails."""
    if not raw:
        return None
    now = monotonic()
    with _ticket_lock:
        _cleanup_tickets(now)
        ticket = _tickets.pop(_ticket_key(raw), None)
    if ticket is None or ticket.expires_at <= now or ticket.room_id != room_id:
        return None
    return ticket


def event_envelope(room_id: int, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Return the versioned server event shape shared by all room realtime work."""
    return {
        "schema": EVENT_SCHEMA,
        "room_id": room_id,
        "type": event_type,
        "server_timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }


class RoomConnectionManager:
    """In-memory presence/broadcast manager for one realtime process."""

    def __init__(self) -> None:
        self._connections: dict[int, dict[int, list[WebSocket]]] = defaultdict(
            lambda: defaultdict(list)
        )
        self._lock = asyncio.Lock()

    async def connect(self, room_id: int, user_id: int, websocket: WebSocket) -> bool:
        """Register a socket and return True when this is the user's first tab."""
        async with self._lock:
            first_connection = not self._connections[room_id][user_id]
            self._connections[room_id][user_id].append(websocket)
            return first_connection

    async def disconnect(self, room_id: int, user_id: int, websocket: WebSocket) -> bool:
        """Remove one socket and return True when the user is now fully offline."""
        async with self._lock:
            room = self._connections.get(room_id)
            if room is None:
                return False
            sockets = room.get(user_id, [])
            if websocket in sockets:
                sockets.remove(websocket)
            if sockets:
                return False
            room.pop(user_id, None)
            if not room:
                self._connections.pop(room_id, None)
            return True

    async def kick_user(self, room_id: int, user_id: int, code: int = 4403) -> bool:
        """Immediately detach and close every live socket for one room member."""
        async with self._lock:
            room = self._connections.get(room_id)
            if room is None:
                return False
            sockets = list(room.pop(user_id, []))
            if not room:
                self._connections.pop(room_id, None)
        for socket in sockets:
            try:
                await socket.close(code=code)
            except Exception:
                continue
        return bool(sockets)

    async def online_user_ids(self, room_id: int) -> list[int]:
        async with self._lock:
            return sorted(self._connections.get(room_id, {}).keys())

    async def broadcast(self, room_id: int, event: dict[str, Any]) -> None:
        """Broadcast best-effort to sockets attached to this process."""
        async with self._lock:
            sockets = [
                socket
                for user_sockets in self._connections.get(room_id, {}).values()
                for socket in user_sockets
            ]
        for socket in sockets:
            try:
                await socket.send_json(event)
            except Exception:
                # Disconnect cleanup belongs to each socket handler. A failed send
                # must not stop healthy participants from receiving the event.
                continue


class MessageRateLimiter:
    """Small in-memory anti-spam window; moderation adds stronger controls later."""

    def __init__(self) -> None:
        self._events: dict[tuple[int, int], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, room_id: int, user_id: int) -> bool:
        now = monotonic()
        key = (room_id, user_id)
        with self._lock:
            window = self._events[key]
            while window and now - window[0] > MESSAGE_RATE_WINDOW_SECONDS:
                window.popleft()
            if len(window) >= MESSAGE_RATE_LIMIT:
                return False
            window.append(now)
            return True


room_connections = RoomConnectionManager()
message_rate_limiter = MessageRateLimiter()
