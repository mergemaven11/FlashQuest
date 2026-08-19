"""Single-process synchronized Arcade host for Quest Rooms.

Quest Rooms reuse the transport-neutral ActivityRuntime from solo Arcade. Player
responses remain pending server-side until the host reveals the round, so a
fast submission cannot leak correctness or the answer key to other learners.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, replace
from threading import Lock
from typing import Any, Iterable

from .activities import (
    ActivityCard,
    ActivityEvent,
    ActivityMode,
    ActivityPhase,
    ActivityRuntime,
    ActivityType,
    apply_activity_event,
    build_activity_runtime,
    public_activity_state,
)


@dataclass
class RoomActivitySession:
    """Ephemeral room-hosted activity plus unrevealed participant submissions."""

    runtime: ActivityRuntime
    submissions: dict[int, dict[str, Any]]


_room_activities: dict[int, RoomActivitySession] = {}
_room_activities_lock = Lock()


def _payload(session: RoomActivitySession) -> dict[str, Any]:
    """Serialize only phase-safe state plus non-answer submission metadata."""
    submitted_user_ids = sorted(session.submissions)
    return {
        "state": public_activity_state(session.runtime).model_dump(mode="json"),
        "submitted_user_ids": submitted_user_ids,
        "submitted_count": len(submitted_user_ids),
    }


def room_activity_payload(room_id: int) -> dict[str, Any] | None:
    """Return the current phase-safe room activity snapshot, if one exists."""
    with _room_activities_lock:
        session = _room_activities.get(room_id)
        return _payload(session) if session is not None else None


def start_room_activity(
    *,
    room_id: int,
    deck_id: int,
    cards: Iterable[ActivityCard],
    activity_type: ActivityType,
    round_count: int = 5,
    seed: int | None = None,
) -> dict[str, Any]:
    """Start Blitz/Match in room mode, replacing only a completed prior run."""
    with _room_activities_lock:
        existing = _room_activities.get(room_id)
        if existing is not None and existing.runtime.phase != ActivityPhase.COMPLETE:
            raise ValueError("A room Arcade activity is already running")

        runtime = build_activity_runtime(
            activity_type=activity_type,
            deck_id=deck_id,
            cards=cards,
            mode=ActivityMode.ROOM,
            seed=seed if seed is not None else secrets.randbits(63),
            round_count=round_count,
        )
        # Deterministic seeds are useful for game construction, while each hosted
        # room run still needs a distinct id for UI/reconnect bookkeeping.
        runtime = replace(runtime, session_id=secrets.token_urlsafe(18))
        session = RoomActivitySession(runtime=runtime, submissions={})
        _room_activities[room_id] = session
        return _payload(session)


def submit_room_activity_response(
    *,
    room_id: int,
    user_id: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Store/replace one participant's unrevealed response for the current round."""
    with _room_activities_lock:
        session = _room_activities.get(room_id)
        if session is None:
            raise ValueError("No room Arcade activity is running")
        if session.runtime.phase not in {ActivityPhase.PROMPT, ActivityPhase.LOCKED}:
            raise ValueError("This round is no longer accepting responses")
        session.submissions[user_id] = dict(payload)
        return _payload(session)


def reveal_room_activity(room_id: int) -> dict[str, Any]:
    """Score all pending responses through the shared runtime, then reveal once."""
    with _room_activities_lock:
        session = _room_activities.get(room_id)
        if session is None:
            raise ValueError("No room Arcade activity is running")
        if session.runtime.phase not in {ActivityPhase.PROMPT, ActivityPhase.LOCKED}:
            raise ValueError("This round cannot be revealed right now")

        scoring_runtime = session.runtime
        for user_id, response_payload in sorted(session.submissions.items()):
            # The shared solo scorer transitions a response to RESULT. For room
            # synchronization we intentionally keep the public phase unrevealed
            # between participants, merge only the participant score state, then
            # perform one synchronized reveal after everyone has been scored.
            scored = apply_activity_event(
                scoring_runtime,
                ActivityEvent(
                    type="response.submitted",
                    participant_id=str(user_id),
                    payload=response_payload,
                ),
            )
            scoring_runtime = replace(
                scoring_runtime,
                phase=session.runtime.phase,
                participants=scored.participants,
                round_result=None,
            )

        session.runtime = apply_activity_event(
            scoring_runtime,
            ActivityEvent(type="answer.revealed"),
        )
        return _payload(session)


def next_room_activity_round(room_id: int) -> dict[str, Any]:
    """Advance a revealed room activity and clear only round-local submissions."""
    with _room_activities_lock:
        session = _room_activities.get(room_id)
        if session is None:
            raise ValueError("No room Arcade activity is running")
        session.runtime = apply_activity_event(
            session.runtime,
            ActivityEvent(type="round.completed"),
        )
        session.submissions.clear()
        return _payload(session)


def end_room_activity(room_id: int) -> dict[str, Any]:
    """Let the host end a room activity without closing the room itself."""
    with _room_activities_lock:
        session = _room_activities.get(room_id)
        if session is None:
            raise ValueError("No room Arcade activity is running")
        session.runtime = apply_activity_event(
            session.runtime,
            ActivityEvent(type="session.completed"),
        )
        session.submissions.clear()
        return _payload(session)


def clear_room_activity(room_id: int) -> None:
    """Test/cleanup helper for explicitly forgetting one ephemeral room runtime."""
    with _room_activities_lock:
        _room_activities.pop(room_id, None)
