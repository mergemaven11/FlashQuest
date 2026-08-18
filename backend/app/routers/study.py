"""Spaced-repetition study routes for featured and user-owned decks."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import and_, asc, desc, func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Card, Deck, Review, User, UserCard
from ..security import DEMO_USER_ID, get_optional_user

router = APIRouter(prefix="/study", tags=["study"])
VALID_TRACKS = {"mixed", "concept", "lab"}


def _now_utc() -> datetime:
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
    return BIN_DELAYS.get(int(b), timedelta(minutes=1))


def _next_review_at_from_bin(b: int) -> Optional[datetime]:
    delay = _fallback_delay_for_bin(b)
    return None if delay is None else _now_utc() + delay


def _demo_user_id(demo_session: str | None) -> int:
    """Map one browser-session token to a stable negative demo user id.

    Real account ids are positive. Negative ids keep anonymous progress isolated
    per browser session without creating throwaway account rows.
    """
    token = (demo_session or "").strip()[:128]
    if not token:
        return DEMO_USER_ID
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
    value = int.from_bytes(digest, "big") & ((1 << 63) - 1)
    return -(value or 1)


def _parse_excluded_card_ids(raw: str | None) -> set[int]:
    if not raw:
        return set()
    values: set[int] = set()
    for item in raw.split(","):
        try:
            value = int(item.strip())
        except ValueError:
            continue
        if value > 0:
            values.add(value)
        if len(values) >= 250:
            break
    return values


def _card_filters(
    deck_id: int | None,
    track: str,
    exclude_card_ids: set[int] | None = None,
) -> list[Any]:
    filters: list[Any] = []
    if deck_id is not None:
        filters.append(Card.deck_id == deck_id)
    if track in {"concept", "lab"}:
        filters.append(Card.kind == track)
    if exclude_card_ids:
        filters.append(~cast(Any, Card.id).in_(sorted(exclude_card_ids)))
    return filters


def _select_next_card_pair(
    session: Session,
    user_id: int = DEMO_USER_ID,
    deck_id: int | None = None,
    track: str = "mixed",
    exclude_card_ids: set[int] | None = None,
) -> Optional[tuple[Card, UserCard]]:
    """Select the next due/new card for one user, deck, and learning mode."""
    nr = cast(Any, UserCard.next_review_at)
    b = cast(Any, UserCard.bin)
    cid = cast(Any, Card.id)
    created = cast(Any, Card.created_at)
    uc_card_id = cast(Any, UserCard.card_id)
    card_filters = _card_filters(deck_id, track, exclude_card_ids)

    due_conditions: list[Any] = [
        UserCard.user_id == user_id,
        UserCard.status == "active",
        and_(nr.is_not(None), nr <= func.now()),
        *card_filters,
    ]
    new_conditions: list[Any] = [
        UserCard.user_id == user_id,
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
    return session.exec(new_stmt).first()


def select_next_card(session: Session) -> Optional[Card]:
    """Compatibility helper used by unit tests."""
    pair = _select_next_card_pair(session)
    return pair[0] if pair else None


def _default_featured_deck(session: Session) -> Deck | None:
    return session.exec(
        select(Deck).where(Deck.is_builtin == True).order_by(Deck.id)  # noqa: E712
    ).first()


def _resolve_deck(
    session: Session,
    deck_id: int | None,
    user: User | None,
    demo_session: str | None = None,
) -> tuple[Deck, int]:
    deck = session.get(Deck, deck_id) if deck_id is not None else _default_featured_deck(session)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    if not deck.is_builtin:
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in to study this deck")
        if deck.owner_id != user.id:
            raise HTTPException(status_code=403, detail="This deck belongs to another account")
    user_id = int(user.id or 0) if user is not None else _demo_user_id(demo_session)
    return deck, user_id


def _ensure_progress(session: Session, user_id: int, deck_id: int) -> None:
    """Create missing per-user progress rows for every card in a selected deck."""
    card_ids = list(session.exec(select(Card.id).where(Card.deck_id == deck_id)).all())
    if not card_ids:
        return
    existing = set(
        session.exec(
            select(UserCard.card_id).where(
                UserCard.user_id == user_id,
                cast(Any, UserCard.card_id).in_(card_ids),
            )
        ).all()
    )
    missing = [card_id for card_id in card_ids if card_id not in existing]
    for card_id in missing:
        session.add(UserCard(user_id=user_id, card_id=card_id, bin=0))
    if missing:
        session.commit()


@router.get("/next")
def study_next(
    deck_id: int | None = Query(None, description="Featured or owned deck id"),
    track: str = Query(
        "mixed",
        description="Study track: mixed, concept, or lab",
        pattern="^(mixed|concept|lab)$",
    ),
    exclude_card_ids: str | None = Query(
        None,
        description="Comma-separated card ids to avoid when drawing the next card",
    ),
    demo_session: str | None = Header(None, alias="X-Demo-Session"),
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Return the next due/new card for a featured or owned deck."""
    if track not in VALID_TRACKS:
        raise HTTPException(status_code=422, detail="invalid study track")

    deck, user_id = _resolve_deck(session, deck_id, user, demo_session)
    resolved_deck_id = int(deck.id or 0)
    _ensure_progress(session, user_id, resolved_deck_id)

    excluded = _parse_excluded_card_ids(exclude_card_ids)
    pair = _select_next_card_pair(
        session,
        user_id,
        resolved_deck_id,
        track,
        exclude_card_ids=excluded,
    )
    # If a user skipped every eligible card, start a fresh pass instead of
    # pretending the deck is finished.
    if pair is None and excluded:
        pair = _select_next_card_pair(session, user_id, resolved_deck_id, track)

    if pair:
        card, uc = pair
        return {
            "status": "ok",
            "deck": {
                "id": resolved_deck_id,
                "title": deck.title,
                "is_builtin": deck.is_builtin,
            },
            "card": {
                "id": card.id,
                "deck_id": card.deck_id,
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

    active = session.exec(
        select(UserCard.id)
        .join(Card, UserCard.card_id == Card.id)
        .where(
            UserCard.user_id == user_id,
            UserCard.status == "active",
            Card.deck_id == resolved_deck_id,
            *_card_filters(None, track),
        )
    ).first()
    return {"status": "permanently_done" if active is None else "temporarily_done"}


@router.post("/answer")
def submit_answer(
    card_id: int = Query(...),
    result: str = Query(..., pattern="^(correct|wrong)$"),
    demo_session: str | None = Header(None, alias="X-Demo-Session"),
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Update spaced-repetition state for the current demo/account user."""
    if result not in {"correct", "wrong"}:
        raise HTTPException(status_code=422, detail="result must be 'correct' or 'wrong'")

    card = session.get(Card, card_id)
    if card is None or card.deck_id is None:
        raise HTTPException(status_code=404, detail="Card not found")
    _deck, user_id = _resolve_deck(session, card.deck_id, user, demo_session)
    _ensure_progress(session, user_id, card.deck_id)

    uc = session.exec(
        select(UserCard).where(
            UserCard.card_id == card_id,
            UserCard.user_id == user_id,
        )
    ).first()
    if uc is None:
        raise HTTPException(status_code=404, detail="Study progress not found")

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
            user_id=user_id,
            result=result,
            from_bin=from_bin,
            to_bin=uc.bin,
            created_at=_now_utc(),
        )
    )
    session.add(uc)
    session.commit()
    return {"ok": True, "to_bin": uc.bin, "status": uc.status}
