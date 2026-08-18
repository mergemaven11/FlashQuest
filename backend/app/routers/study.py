# app/routers/study.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, asc, desc, func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Card, Review, UserCard

router = APIRouter(prefix="/study", tags=["study"])
DEFAULT_USER_ID = 1
VALID_TRACKS = {"mixed", "concept", "lab"}


def _now_utc() -> datetime:
    """Return timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


BIN_DELAYS: dict[int, Optional[timedelta]] = {
    0: timedelta(seconds=0),
    1: timedelta(seconds=5),
    2: timedelta(seconds=25),
    3: timedelta(minutes=2),
    4: timedelta(minutes=10),
    5: timedelta(hours=1),
    6: timedelta(hours=5),
    7: timedelta(days=1),
    8: timedelta(days=5),
    9: timedelta(days=25),
    10: timedelta(days=120),
    11: None,
}


def _fallback_delay_for_bin(b: int) -> Optional[timedelta]:
    """Return the configured delay for a bin; None means terminal mastery."""
    return BIN_DELAYS.get(int(b), timedelta(minutes=1))


def _next_review_at_from_bin(b: int) -> Optional[datetime]:
    """Compute the next review time in UTC."""
    delay = _fallback_delay_for_bin(b)
    return None if delay is None else _now_utc() + delay


def _card_filters(topic: str | None, track: str) -> list[Any]:
    """Build reusable card filters for topic and learning mode."""
    filters: list[Any] = []
    if topic:
        filters.append(cast(Any, Card.topic) == topic)
    if track in {"concept", "lab"}:
        filters.append(cast(Any, Card.kind) == track)
    return filters


def _select_next_card_pair(
    session: Session,
    topic: str | None = None,
    track: str = "mixed",
) -> Optional[tuple[Card, UserCard]]:
    """Select the next due/new card for a topic and learning mode."""
    nr = cast(Any, UserCard.next_review_at)
    b = cast(Any, UserCard.bin)
    cid = cast(Any, Card.id)
    created = cast(Any, Card.created_at)
    uc_card_id = cast(Any, UserCard.card_id)
    card_filters = _card_filters(topic, track)

    due_conditions: list[Any] = [
        UserCard.user_id == DEFAULT_USER_ID,
        UserCard.status == "active",
        and_(nr.is_not(None), nr <= func.now()),
        *card_filters,
    ]
    new_conditions: list[Any] = [
        UserCard.user_id == DEFAULT_USER_ID,
        UserCard.status == "active",
        cast(Any, UserCard.bin) == 0,
        nr.is_(None),
        *card_filters,
    ]

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


def select_next_card(session: Session) -> Optional[Card]:
    """Compatibility helper used by tests and callers that want a mixed deck."""
    pair = _select_next_card_pair(session)
    return pair[0] if pair else None


@router.get("/topics")
def study_topics(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    """Return available topics with concept/lab counts for the topic picker."""
    rows = session.exec(select(Card.topic, Card.kind)).all()
    topics: dict[str, dict[str, Any]] = {}
    for topic_value, kind_value in rows:
        topic = str(topic_value or "Custom")
        kind = str(kind_value or "concept")
        item = topics.setdefault(
            topic,
            {"topic": topic, "total": 0, "concepts": 0, "labs": 0},
        )
        item["total"] += 1
        if kind == "lab":
            item["labs"] += 1
        else:
            item["concepts"] += 1
    return sorted(topics.values(), key=lambda item: (-item["total"], item["topic"]))


@router.get("/next")
def study_next(
    topic: str | None = Query(None, description="Optional topic/deck name"),
    track: str = Query(
        "mixed",
        description="Study track: mixed, concept, or lab",
        pattern="^(mixed|concept|lab)$",
    ),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Return the next due/new card for the selected topic and track."""
    if track not in VALID_TRACKS:
        raise HTTPException(status_code=422, detail="invalid study track")

    cid = cast(Any, Card.id)
    uc_card_id = cast(Any, UserCard.card_id)
    active_conditions: list[Any] = [
        UserCard.user_id == DEFAULT_USER_ID,
        UserCard.status == "active",
        *_card_filters(topic, track),
    ]

    has_active = session.exec(
        select(UserCard.id)
        .join(Card, uc_card_id == cid)
        .where(*active_conditions)
    ).first()
    if has_active is None:
        return {"status": "permanently_done"}

    pair = _select_next_card_pair(session, topic, track)
    if pair:
        card, uc = pair
        return {
            "status": "ok",
            "card": {
                "id": card.id,
                "word": card.word,
                "definition": card.definition,
                "topic": card.topic,
                "domain": card.domain,
                "kind": card.kind,
                "is_builtin": card.is_builtin,
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
    """Accept an answer and update spaced-repetition state."""
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
