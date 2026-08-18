# app/routers/cards.py
from __future__ import annotations

from hmac import compare_digest
from typing import Any, Dict, List, Optional, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import asc, desc, func, or_, update
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
    Review,
    UserCard,
)

router = APIRouter()
DEFAULT_USER_ID = 1
VALID_KINDS = {"concept", "lab"}


def _clean_card_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize user-provided reusable deck metadata."""
    for field in ("word", "definition", "topic", "domain", "kind"):
        if field in data and isinstance(data[field], str):
            data[field] = data[field].strip()
    data["topic"] = data.get("topic") or "Custom"
    data["domain"] = data.get("domain") or "General"
    data["kind"] = (data.get("kind") or "concept").lower()
    if data["kind"] not in VALID_KINDS:
        raise HTTPException(status_code=422, detail="kind must be 'concept' or 'lab'")
    if not data.get("word") or not data.get("definition"):
        raise HTTPException(status_code=422, detail="question and answer are required")
    return data


def _require_demo_password(password: str | None) -> None:
    """Require the server-side demo password for global/built-in destructive actions."""
    expected = settings.DEMO_DELETE_PASSWORD
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Demo admin password is not configured; protected action is disabled",
        )
    if not password or not compare_digest(password, expected):
        raise HTTPException(status_code=403, detail="Incorrect demo admin password")


@router.post("/cards", response_model=CardRead)
def create_card(
    payload: CardCreate, session: Session = Depends(get_session)
) -> CardRead:
    """Create a user-owned card in any topic/domain and initialize progress."""
    data = _clean_card_fields(payload.model_dump())
    card = Card(**data, is_builtin=False)
    session.add(card)
    session.commit()
    session.refresh(card)

    session.add(UserCard(user_id=DEFAULT_USER_ID, card_id=card.id))
    session.commit()
    return card


@router.get("/cards", response_model=List[CardRead])
def list_cards(session: Session = Depends(get_session)) -> List[CardRead]:
    """Return every card in stable ID order."""
    rows = session.exec(select(Card).order_by(asc(cast(Any, Card.id)))).all()
    return list(rows)


@router.put("/cards/{card_id}", response_model=CardRead)
def replace_card(
    card_id: int, payload: CardUpdate, session: Session = Depends(get_session)
) -> CardRead:
    """Update the editable fields of a custom card."""
    return _update_card(card_id, payload, session)


@router.patch("/cards/{card_id}", response_model=CardRead)
def update_card(
    card_id: int, payload: CardUpdate, session: Session = Depends(get_session)
) -> CardRead:
    """Partially update a custom card."""
    return _update_card(card_id, payload, session)


def _update_card(card_id: int, payload: CardUpdate, session: Session) -> CardRead:
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    if card.is_builtin:
        raise HTTPException(
            status_code=403,
            detail="Built-in demo cards are read-only; make a custom copy to edit them",
        )

    data = payload.model_dump(exclude_unset=True)
    merged = {
        "word": data.get("word", card.word),
        "definition": data.get("definition", card.definition),
        "topic": data.get("topic", card.topic),
        "domain": data.get("domain", card.domain),
        "kind": data.get("kind", card.kind),
    }
    cleaned = _clean_card_fields(merged)
    for field, value in cleaned.items():
        setattr(card, field, value)

    session.add(card)
    session.commit()
    session.refresh(card)
    return card


@router.delete("/cards/{card_id}")
def delete_card(
    card_id: int,
    session: Session = Depends(get_session),
    demo_password: str | None = Header(None, alias="X-Demo-Admin-Password"),
) -> Dict[str, bool]:
    """Delete a card; built-in demo cards require the server-side admin password."""
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    if card.is_builtin:
        _require_demo_password(demo_password)

    session.exec(
        delete(Review).where(
            Review.card_id == card_id,
            Review.user_id == DEFAULT_USER_ID,
        )
    )
    session.exec(
        delete(UserCard).where(
            UserCard.card_id == card_id,
            UserCard.user_id == DEFAULT_USER_ID,
        )
    )
    session.delete(card)
    session.commit()
    return {"ok": True}


@router.get("/cards/admin", response_model=List[CardAdminRead])
def list_cards_admin(
    q: Optional[str] = Query(
        None, description="Case-insensitive search over card content and metadata"
    ),
    session: Session = Depends(get_session),
) -> List[CardAdminRead]:
    """Return cards with reusable deck metadata and per-user study state."""
    stmt = (
        select(Card, UserCard)
        .join(UserCard, cast(Any, UserCard.card_id) == cast(Any, Card.id))
        .where(UserCard.user_id == DEFAULT_USER_ID)
    )

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

    stmt = stmt.order_by(desc(cast(Any, Card.id)))
    rows = session.exec(stmt).all()

    return [
        CardAdminRead(
            id=card.id,
            word=card.word,
            definition=card.definition,
            topic=card.topic,
            domain=card.domain,
            kind=card.kind,
            is_builtin=card.is_builtin,
            created_at=card.created_at,
            bin=uc.bin,
            status=uc.status,
        )
        for card, uc in rows
    ]


@router.get("/cards/stats", response_model=CardStats)
def card_stats(session: Session = Depends(get_session)) -> CardStats:
    """Return aggregate study stats for the shared demo user."""
    total_cards = session.exec(
        select(func.count())
        .select_from(UserCard)
        .where(UserCard.user_id == DEFAULT_USER_ID)
    ).one()

    status_rows = session.exec(
        select(UserCard.status, func.count())
        .where(UserCard.user_id == DEFAULT_USER_ID)
        .group_by(UserCard.status)
    ).all()
    status_counts: Dict[str, int] = {str(s): int(c) for s, c in status_rows}

    bin_rows = session.exec(
        select(cast(Any, UserCard.bin), func.count())
        .where(UserCard.user_id == DEFAULT_USER_ID)
        .group_by(cast(Any, UserCard.bin))
    ).all()
    by_bin: Dict[int, int] = {i: 0 for i in range(12)}
    for b, c in bin_rows:
        by_bin[int(b)] = int(c)

    return CardStats(
        total_cards=int(total_cards or 0),
        active=int(status_counts.get("active", 0)),
        never=int(status_counts.get("never", 0)),
        hard_to_remember=int(status_counts.get("hard_to_remember", 0)),
        by_bin=by_bin,
    )


@router.post("/admin/reset")
@router.post("/cards/admin/reset")
def reset_all_progress(
    session: Session = Depends(get_session),
    demo_password: str | None = Header(None, alias="X-Demo-Admin-Password"),
) -> dict[str, int | bool]:
    """Reset shared demo progress after verifying the demo admin password."""
    _require_demo_password(demo_password)

    card_ids = session.exec(select(Card.id)).all()
    existing_card_ids = set(
        session.exec(
            select(UserCard.card_id).where(UserCard.user_id == DEFAULT_USER_ID)
        ).all()
    )
    to_insert = [cid for cid in card_ids if cid not in existing_card_ids]
    for cid in to_insert:
        session.add(
            UserCard(
                user_id=DEFAULT_USER_ID,
                card_id=cid,
                bin=0,
                wrong_count=0,
                next_review_at=None,
                status="active",
            )
        )

    deleted_reviews = (
        session.exec(delete(Review).where(Review.user_id == DEFAULT_USER_ID)).rowcount
        or 0
    )
    updated_usercards = (
        session.exec(
            update(UserCard)
            .where(UserCard.user_id == DEFAULT_USER_ID)
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
