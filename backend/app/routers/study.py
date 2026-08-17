# app/routers/study.py
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from sqlalchemy import asc, desc, func, and_

from ..db import get_session
from ..models import UserCard, Card, Review

router = APIRouter(prefix="/study", tags=["study"])
DEFAULT_USER_ID = 1
VALID_TRACKS = {"mixed", "concept", "lab"}


# ---------- Time helpers (timezone-aware UTC) ----------
def _now_utc() -> datetime:
    """Return timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


# Spec-accurate bin delays (bins 1–11); bin 11 = never
BIN_DELAYS: dict[int, Optional[timedelta]] = {
    0: timedelta(seconds=0),  # new
    1: timedelta(seconds=5),
    2: timedelta(seconds=25),
    3: timedelta(minutes=2),
    4: timedelta(minutes=10),
    5: timedelta(hours=1),
    6: timedelta(hours=5),
    7: timedelta(days=1),
    8: timedelta(days=5),
    9: timedelta(days=25),
    10: timedelta(days=120),  # ~4 months
    11: None,  # never
}


def _fallback_delay_for_bin(b: int) -> Optional[timedelta]:
    """Return the spec delay for a bin; None means 'never'."""
    return BIN_DELAYS.get(int(b), timedelta(minutes=1))


def _next_review_at_from_bin(b: int) -> Optional[datetime]:
    """Compute next review time as timezone-aware UTC; None for 'never'."""
    delay = _fallback_delay_for_bin(b)
    return None if delay is None else _now_utc() + delay


def _track_clause(track: str) -> Any | None:
    """Return a SQL clause that limits study to concepts or break/fix labs."""
    word = cast(Any, Card.word)
    if track == "lab":
        return word.like("LAB ·%")
    if track == "concept":
        return ~word.like("LAB ·%")
    return None


# ---------- Selection logic ----------
def _select_next_card_pair(
    session: Session, track: str = "mixed"
) -> Optional[tuple[Card, UserCard]]:
    """
    Select the next card for the default user and requested study track.

    Selection priority:
      1) Any due active card (next_review_at <= now), preferring:
         - Higher bin numbers first
         - Then earliest due time
         - Then lowest Card.id (stable)
      2) If no due cards, return the newest "new" card:
         - bin = 0 and next_review_at IS NULL
         - Ordered by created_at DESC, then Card.id DESC
    """
    nr = cast(Any, UserCard.next_review_at)
    b = cast(Any, UserCard.bin)
    cid = cast(Any, Card.id)
    created = cast(Any, Card.created_at)
    uc_card_id = cast(Any, UserCard.card_id)
    track_clause = _track_clause(track)

    due_conditions: list[Any] = [
        UserCard.user_id == DEFAULT_USER_ID,
        UserCard.status == "active",
        and_(nr.is_not(None), nr <= func.now()),
    ]
    new_conditions: list[Any] = [
        UserCard.user_id == DEFAULT_USER_ID,
        UserCard.status == "active",
        cast(Any, UserCard.bin) == 0,
        nr.is_(None),
    ]
    if track_clause is not None:
        due_conditions.append(track_clause)
        new_conditions.append(track_clause)

    due_stmt = (
        select(Card, UserCard)
        .join(UserCard, uc_card_id == cid)
        .where(*due_conditions)
        .order_by(desc(b), asc(nr), asc(cid))
        .limit(1)
    )
    due_row = session.exec(due_stmt).first()
    if due_row:
        return due_row

    new_stmt = (
        select(Card, UserCard)
        .join(UserCard, uc_card_id == cid)
        .where(*new_conditions)
        .order_by(desc(created), desc(cid))
        .limit(1)
    )
    new_row = session.exec(new_stmt).first()
    if new_row:
        return new_row

    return None


# --- Public function expected by tests ---
def select_next_card(session: Session) -> Optional[Card]:
    """Return only the Card (or None) using the mixed-deck priority."""
    pair = _select_next_card_pair(session)
    return pair[0] if pair else None


# ---------- Routes ----------
@router.get("/next")
def study_next(
    track: str = Query(
        "mixed",
        description="Study track: mixed, concept, or lab",
        pattern="^(mixed|concept|lab)$",
    ),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Return the next due/new card for the selected study track."""
    if track not in VALID_TRACKS:
        raise HTTPException(status_code=422, detail="invalid study track")

    cid = cast(Any, Card.id)
    uc_card_id = cast(Any, UserCard.card_id)
    active_conditions: list[Any] = [
        UserCard.user_id == DEFAULT_USER_ID,
        UserCard.status == "active",
    ]
    track_clause = _track_clause(track)
    if track_clause is not None:
        active_conditions.append(track_clause)

    has_active = session.exec(
        select(UserCard.id)
        .join(Card, uc_card_id == cid)
        .where(*active_conditions)
    ).first()
    if has_active is None:
        return {"status": "permanently_done"}

    pair = _select_next_card_pair(session, track)
    if pair:
        card, uc = pair
        return {
            "status": "ok",
            "card": {
                "id": card.id,
                "word": card.word,
                "definition": card.definition,
                "bin": uc.bin,
                "status": uc.status,
            },
        }

    return {"status": "temporarily_done"}


@router.post("/answer")
def submit_answer(
    card_id: int = Query(..., description="Card ID to answer"),
    result: str = Query(..., description="'correct' or 'wrong'"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """
    Accept an answer and update spaced-repetition state.

    Query Args:
        card_id: Card to answer.
        result: 'correct' or 'wrong'.

    Returns:
        {"ok": True, "to_bin": int, "status": "active|hard_to_remember|never"}
    """
    if result not in ("correct", "wrong"):
        raise HTTPException(
            status_code=422, detail="result must be 'correct' or 'wrong'"
        )

    uc = session.exec(
        select(UserCard).where(
            UserCard.card_id == card_id,
            UserCard.user_id == DEFAULT_USER_ID,
        )
    ).first()
    if not uc:
        raise HTTPException(status_code=404, detail="Card not found")

    from_bin = uc.bin

    if result == "correct":
        uc.bin = min(uc.bin + 1, 11)
    else:
        uc.bin = 1
        uc.wrong_count += 1
        if uc.wrong_count >= 10:
            uc.status = "hard_to_remember"

    uc.next_review_at = _next_review_at_from_bin(uc.bin)

    if uc.bin == 11:
        uc.status = "never"
        uc.next_review_at = None

    session.add(
        Review(
            card_id=card_id,
            user_id=DEFAULT_USER_ID,
            result=result,
            from_bin=from_bin,
            to_bin=uc.bin,
            created_at=_now_utc(),
        )
    )
    session.add(uc)
    session.commit()

    return {"ok": True, "to_bin": uc.bin, "status": uc.status}
