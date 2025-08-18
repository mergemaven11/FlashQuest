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


# ---------- Selection logic ----------
def _select_next_card_pair(session: Session) -> Optional[tuple[Card, UserCard]]:
    """
    Select the next card for the default user to study.

    Selection priority:
      1) Any due active card (next_review_at <= now), preferring:
         - Higher bin numbers first
         - Then earliest due time
         - Then lowest Card.id (stable)
      2) If no due cards, return the newest "new" card:
         - bin = 0 and next_review_at IS NULL
         - Ordered by created_at DESC, then Card.id DESC
    """
    # Cast ORM attributes to SQL expressions for mypy
    nr = cast(Any, UserCard.next_review_at)
    b = cast(Any, UserCard.bin)
    cid = cast(Any, Card.id)
    created = cast(Any, Card.created_at)
    uc_card_id = cast(Any, UserCard.card_id)

    # 1) due active card(s): prefer higher bin, then earliest due
    due_stmt = (
        select(Card, UserCard)
        .join(UserCard, uc_card_id == cid)  # casted ON clause
        .where(
            UserCard.user_id == DEFAULT_USER_ID,
            UserCard.status == "active",
            and_(nr.is_not(None), nr <= func.now()),
        )
        .order_by(
            desc(b),  # prefer higher bin
            asc(nr),  # then earliest due
            asc(cid),  # stable tiebreaker
        )
        .limit(1)
    )
    due_row = session.exec(due_stmt).first()
    if due_row:
        return due_row  # (Card, UserCard)

    # 2) newest "new" bin-0 card (next_review_at is NULL)
    new_stmt = (
        select(Card, UserCard)
        .join(UserCard, uc_card_id == cid)  # casted ON clause
        .where(
            UserCard.user_id == DEFAULT_USER_ID,
            UserCard.status == "active",
            cast(Any, UserCard.bin) == 0,  # cast to avoid bool typing
            nr.is_(None),
        )
        .order_by(desc(created), desc(cid))
        .limit(1)
    )
    new_row = session.exec(new_stmt).first()
    if new_row:
        return new_row

    return None


# --- Public function expected by tests ---
def select_next_card(session: Session) -> Optional[Card]:
    """Return only the Card (or None) using the same priority as _select_next_card_pair."""
    pair = _select_next_card_pair(session)
    return pair[0] if pair else None


# ---------- Routes ----------
@router.get("/next")
def study_next(session: Session = Depends(get_session)):
    """
    Return the next card to study for the default user.

    - If there are no ACTIVE cards at all -> {"status":"permanently_done"}
    - Else if there are ACTIVE cards but none due/new -> {"status":"temporarily_done"}
    - Else -> {"status":"ok", "card": {...}}
    """
    # 0) If there are no ACTIVE cards, we are permanently done
    has_active = session.exec(
        select(UserCard.id).where(
            UserCard.user_id == DEFAULT_USER_ID,
            UserCard.status == "active",
        )
    ).first()
    if has_active is None:
        return {"status": "permanently_done"}

    # 1) Try to pick a due/new active card
    pair = _select_next_card_pair(session)
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

    # 2) We have active cards but none are due/new right now
    return {"status": "temporarily_done"}


@router.post("/answer")
def submit_answer(
    card_id: int = Query(..., description="Card ID to answer"),
    result: str = Query(..., description="'correct' or 'wrong'"),
    session: Session = Depends(get_session),
):
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

    # Compute next review time per spec (bin 11 => never/None)
    uc.next_review_at = _next_review_at_from_bin(uc.bin)

    # If card reached bin 11, mark never and clear next review (per spec)
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
