"""HTTP host for the first playable solo FlashQuest Arcade sessions.

V1 sessions are deliberately ephemeral in-process state. The ActivityRuntime is
transport-neutral and can later be hosted by persistent/realtime Quest Room
infrastructure without changing the game adapters.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass, replace
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..activities import (
    ActivityCard,
    ActivityEvent,
    ActivityMode,
    ActivityPublicState,
    ActivityRuntime,
    ActivityType,
    apply_activity_event,
    build_activity_runtime,
    public_activity_state,
)
from ..db import get_session
from ..models import Card, Deck, User
from ..security import get_optional_user

router = APIRouter(prefix="/activities", tags=["activities"])
SESSION_TTL_SECONDS = 2 * 60 * 60
MAX_SESSIONS = 500


class ActivityStartRequest(BaseModel):
    """Request to create one deterministic solo Arcade run."""

    deck_id: int = Field(gt=0)
    activity_type: ActivityType
    round_count: int = Field(default=5, ge=1, le=20)
    seed: int | None = Field(default=None, ge=0)


@dataclass
class _StoredRuntime:
    runtime: ActivityRuntime
    owner_key: str
    touched_at: float


_sessions: dict[str, _StoredRuntime] = {}
_sessions_lock = Lock()


def _owner_key(user: User | None, demo_session: str | None) -> str:
    """Bind ephemeral game state to an account or anonymous browser session."""
    if user is not None:
        return f"user:{int(user.id or 0)}"
    token = (demo_session or "").strip()
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Anonymous Arcade requires an X-Demo-Session browser session",
        )
    digest = hashlib.blake2b(token[:128].encode("utf-8"), digest_size=12).hexdigest()
    return f"demo:{digest}"


def _accessible_deck(session: Session, deck_id: int, user: User | None) -> Deck:
    """Enforce the same private/public/unlisted boundary used by Study."""
    deck = session.get(Deck, deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    owner = user is not None and deck.owner_id == user.id
    shareable = deck.is_builtin or deck.visibility in {"public", "unlisted"}
    if shareable or owner:
        return deck
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to play this private deck")
    raise HTTPException(status_code=403, detail="This deck is private")


def _activity_cards(session: Session, deck_id: int) -> list[ActivityCard]:
    """Load deck content into the transport-neutral activity card shape."""
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


def _cleanup_sessions(now: float) -> None:
    """Bound ephemeral memory without a background cleanup task."""
    expired = [
        session_id
        for session_id, record in _sessions.items()
        if now - record.touched_at > SESSION_TTL_SECONDS
    ]
    for session_id in expired:
        _sessions.pop(session_id, None)

    if len(_sessions) <= MAX_SESSIONS:
        return
    oldest = sorted(_sessions.items(), key=lambda item: item[1].touched_at)
    for session_id, _record in oldest[: len(_sessions) - MAX_SESSIONS]:
        _sessions.pop(session_id, None)


def _store(runtime: ActivityRuntime, owner_key: str) -> None:
    now = monotonic()
    with _sessions_lock:
        _cleanup_sessions(now)
        _sessions[runtime.session_id] = _StoredRuntime(
            runtime=runtime,
            owner_key=owner_key,
            touched_at=now,
        )


def _load(session_id: str, owner_key: str) -> ActivityRuntime:
    now = monotonic()
    with _sessions_lock:
        _cleanup_sessions(now)
        record = _sessions.get(session_id)
        if record is None:
            raise HTTPException(
                status_code=404,
                detail="Arcade session expired or was not found",
            )
        if record.owner_key != owner_key:
            raise HTTPException(status_code=404, detail="Arcade session not found")
        record.touched_at = now
        return record.runtime


@router.post("/start", response_model=ActivityPublicState, status_code=201)
def start_activity(
    payload: ActivityStartRequest,
    demo_session: str | None = Header(None, alias="X-Demo-Session"),
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> ActivityPublicState:
    """Create an ephemeral solo Arcade runtime for an accessible deck."""
    deck = _accessible_deck(session, payload.deck_id, user)
    owner_key = _owner_key(user, demo_session)
    cards = _activity_cards(session, int(deck.id or 0))
    seed = payload.seed if payload.seed is not None else secrets.randbits(63)
    try:
        runtime = build_activity_runtime(
            activity_type=payload.activity_type,
            deck_id=int(deck.id or 0),
            cards=cards,
            mode=ActivityMode.SOLO,
            seed=seed,
            round_count=payload.round_count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Runtime adapters are deterministic by seed, while HTTP sessions need a
    # collision-resistant capability id so two learners can replay one seed safely.
    runtime = replace(runtime, session_id=secrets.token_urlsafe(18))
    _store(runtime, owner_key)
    return public_activity_state(runtime)


@router.get("/{session_id}", response_model=ActivityPublicState)
def activity_state(
    session_id: str,
    demo_session: str | None = Header(None, alias="X-Demo-Session"),
    user: User | None = Depends(get_optional_user),
) -> ActivityPublicState:
    """Recover current phase-safe state for the same solo browser/account."""
    owner_key = _owner_key(user, demo_session)
    return public_activity_state(_load(session_id, owner_key))


@router.post("/{session_id}/events", response_model=ActivityPublicState)
def activity_event(
    session_id: str,
    event: ActivityEvent,
    demo_session: str | None = Header(None, alias="X-Demo-Session"),
    user: User | None = Depends(get_optional_user),
) -> ActivityPublicState:
    """Apply one server-authoritative game transition and return safe state."""
    owner_key = _owner_key(user, demo_session)
    runtime = _load(session_id, owner_key)
    try:
        updated = apply_activity_event(runtime, event)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _store(updated, owner_key)
    return public_activity_state(updated)
