"""Card CRUD, demo protection, and scoped card-management endpoints."""

from __future__ import annotations

from hmac import compare_digest
from typing import Any, Dict, List, Optional, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import and_, desc, or_, update
from sqlmodel import Session, delete, select

from app.config import settings
from app.db import get_session
from app.models import (
    Card,
    CardAdminRead,
    CardCreate,
    CardRead,
    CardStats,
    CardUpdate,
    Deck,
    Review,
    User,
    UserCard,
)
from app.security import DEMO_USER_ID, get_optional_user, require_verified_user

router = APIRouter()
VALID_KINDS = {"concept", "lab"}


def _clean_text(value: str, field: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"{field} is required")
    return cleaned


def _clean_kind(value: str) -> str:
    kind = value.strip().lower() or "concept"
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=422, detail="kind must be 'concept' or 'lab'")
    return kind


def _require_demo_password(password: str | None) -> None:
    expected = settings.DEMO_DELETE_PASSWORD
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Demo admin password is not configured; protected action is disabled",
        )
    if not password or not compare_digest(password, expected):
        raise HTTPException(status_code=403, detail="Incorrect demo admin password")


def _owned_deck(session: Session, deck_id: int, user: User) -> Deck:
    deck = session.get(Deck, deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.is_builtin or deck.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You can only change your own decks")
    return deck


def _owned_card(session: Session, card_id: int, user: User) -> tuple[Card, Deck]:
    card = session.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    if card.is_builtin:
        raise HTTPException(
            status_code=403,
            detail="Built-in cards are read-only. Copy the featured deck to customize it.",
        )
    if card.deck_id is None:
        raise HTTPException(status_code=403, detail="Legacy card is not attached to your deck")
    return card, _owned_deck(session, card.deck_id, user)


@router.post("/cards", response_model=CardRead, status_code=201)
def create_card(
    payload: CardCreate,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> CardRead:
    deck = _owned_deck(session, payload.deck_id, user)
    card = Card(
        deck_id=deck.id,
        word=_clean_text(payload.word, "question"),
        definition=_clean_text(payload.definition, "answer"),
        topic=deck.title,
        domain=payload.domain.strip() or "General",
        kind=_clean_kind(payload.kind),
        is_builtin=False,
    )
    session.add(card)
    session.flush()
    session.add(UserCard(user_id=user.id, card_id=int(card.id or 0), bin=0))
    session.commit()
    session.refresh(card)
    return card


@router.get("/cards", response_model=List[CardRead])
def list_cards(
    deck_id: int | None = Query(None),
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> List[CardRead]:
    stmt = select(Card).outerjoin(Deck, Card.deck_id == Deck.id)
    if user is None:
        stmt = stmt.where(Card.is_builtin == True)  # noqa: E712
    else:
        stmt = stmt.where(
            or_(Card.is_builtin == True, Deck.owner_id == user.id)  # noqa: E712
        )
    if deck_id is not None:
        stmt = stmt.where(Card.deck_id == deck_id)
    return list(session.exec(stmt.order_by(cast(Any, Card.id))).all())


@router.put("/cards/{card_id}", response_model=CardRead)
def replace_card(
    card_id: int,
    payload: CardUpdate,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> CardRead:
    return _update_card(card_id, payload, user, session)


@router.patch("/cards/{card_id}", response_model=CardRead)
def update_card(
    card_id: int,
    payload: CardUpdate,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> CardRead:
    return _update_card(card_id, payload, user, session)


def _update_card(
    card_id: int, payload: CardUpdate, user: User, session: Session
) -> CardRead:
    card, deck = _owned_card(session, card_id, user)
    data = payload.model_dump(exclude_unset=True)
    if data.get("word") is not None:
        card.word = _clean_text(data["word"], "question")
    if data.get("definition") is not None:
        card.definition = _clean_text(data["definition"], "answer")
    if data.get("domain") is not None:
        card.domain = data["domain"].strip() or "General"
    if data.get("kind") is not None:
        card.kind = _clean_kind(data["kind"])
    card.topic = deck.title
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


@router.delete("/cards/{card_id}")
def delete_card(
    card_id: int,
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
    demo_password: str | None = Header(None, alias="X-Demo-Admin-Password"),
) -> Dict[str, bool]:
    card = session.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")

    if card.is_builtin:
        _require_demo_password(demo_password)
    else:
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required")
        _owned_card(session, card_id, user)

    session.exec(delete(Review).where(Review.card_id == card_id))
    session.exec(delete(UserCard).where(UserCard.card_id == card_id))
    session.delete(card)
    session.commit()
    return {"ok": True}


@router.get("/cards/admin", response_model=List[CardAdminRead])
def list_cards_admin(
    q: Optional[str] = Query(None),
    deck_id: int | None = Query(None),
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> List[CardAdminRead]:
    user_id = int(user.id or 0) if user is not None else DEMO_USER_ID
    uc_card_id = cast(Any, UserCard.card_id)
    card_id = cast(Any, Card.id)
    stmt = (
        select(Card, UserCard)
        .outerjoin(
            UserCard,
            and_(uc_card_id == card_id, UserCard.user_id == user_id),
        )
        .outerjoin(Deck, Card.deck_id == Deck.id)
    )
    if user is None:
        stmt = stmt.where(Card.is_builtin == True)  # noqa: E712
    else:
        stmt = stmt.where(
            or_(Card.is_builtin == True, Deck.owner_id == user.id)  # noqa: E712
        )
    if deck_id is not None:
        stmt = stmt.where(Card.deck_id == deck_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                cast(Any, Card.word).ilike(like),
                cast(Any, Card.definition).ilike(like),
                cast(Any, Card.topic).ilike(like),
                cast(Any, Card.domain).ilike(like),
                cast(Any, Card.kind).ilike(like),
            )
        )

    rows = session.exec(stmt.order_by(desc(card_id))).all()
    return [
        CardAdminRead(
            id=int(card.id or 0),
            deck_id=card.deck_id,
            word=card.word,
            definition=card.definition,
            topic=card.topic,
            domain=card.domain,
            kind=card.kind,
            is_builtin=card.is_builtin,
            created_at=card.created_at,
            bin=uc.bin if uc is not None else 0,
            status=uc.status if uc is not None else "active",
        )
        for card, uc in rows
    ]


@router.get("/cards/stats", response_model=CardStats)
def card_stats(
    deck_id: int | None = Query(None),
    user: User | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> CardStats:
    user_id = int(user.id or 0) if user is not None else DEMO_USER_ID
    conditions: list[Any] = [UserCard.user_id == user_id]
    if deck_id is not None:
        conditions.append(Card.deck_id == deck_id)

    rows = session.exec(
        select(UserCard).join(Card, UserCard.card_id == Card.id).where(*conditions)
    ).all()
    by_bin: Dict[int, int] = {i: 0 for i in range(12)}
    status_counts: Dict[str, int] = {}
    for uc in rows:
        by_bin[int(uc.bin)] += 1
        status_counts[uc.status] = status_counts.get(uc.status, 0) + 1

    return CardStats(
        total_cards=len(rows),
        active=status_counts.get("active", 0),
        never=status_counts.get("never", 0),
        hard_to_remember=status_counts.get("hard_to_remember", 0),
        by_bin=by_bin,
    )


@router.post("/cards/admin/reset")
def reset_demo_progress(
    session: Session = Depends(get_session),
    demo_password: str | None = Header(None, alias="X-Demo-Admin-Password"),
) -> dict[str, int | bool]:
    _require_demo_password(demo_password)
    builtin_ids = list(
        session.exec(select(Card.id).where(Card.is_builtin == True)).all()  # noqa: E712
    )
    existing_ids = set(
        session.exec(
            select(UserCard.card_id).where(
                UserCard.user_id == DEMO_USER_ID,
                cast(Any, UserCard.card_id).in_(builtin_ids),
            )
        ).all()
    )
    to_insert = [cid for cid in builtin_ids if cid not in existing_ids]
    for cid in to_insert:
        session.add(UserCard(user_id=DEMO_USER_ID, card_id=cid, bin=0))

    deleted_reviews = (
        session.exec(
            delete(Review).where(
                Review.user_id == DEMO_USER_ID,
                cast(Any, Review.card_id).in_(builtin_ids),
            )
        ).rowcount
        or 0
    )
    updated_usercards = (
        session.exec(
            update(UserCard)
            .where(
                UserCard.user_id == DEMO_USER_ID,
                cast(Any, UserCard.card_id).in_(builtin_ids),
            )
            .values(bin=0, wrong_count=0, next_review_at=None, status="active")
        ).rowcount
        or 0
    )

    session.commit()
    return {
        "ok": True,
        "inserted_usercards": len(to_insert),
        "deleted_reviews": int(deleted_reviews),
        "updated_usercards": int(updated_usercards),
    }
