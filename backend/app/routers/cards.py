from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, delete

from ..db import get_session
from ..models import Card, UserCard, Review
from ..schemas import CardCreate, CardUpdate, AdminCard, Stats

router = APIRouter(prefix="/cards", tags=["cards"])

@router.post("", response_model=Card)
def create_card(payload: CardCreate, session: Session = Depends(get_session)):
    """
    Create a new vocabulary card and initialize its user tracking at bin 0.

    Args:
        payload: CardCreate with word/definition.
        session: DB session.

    Returns:
        The created Card record.
    """
    card = Card(word=payload.word, definition=payload.definition)
    session.add(card)
    session.commit()
    session.refresh(card)

    session.add(UserCard(card_id=card.id, bin=0))
    session.commit()
    return card

@router.get("", response_model=List[Card])
def list_cards(session: Session = Depends(get_session)):
    """
    Retrieve all cards (basic listing for convenience).
    """
    return session.exec(select(Card).order_by(Card.id.desc())).all()

@router.get("/admin", response_model=List[AdminCard])
def list_cards_admin(
    q: Optional[str] = Query(default=None, description="Filter by word/definition contains"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    """
    Admin view: list cards with study status, filterable/paged.

    Ordering: newest Card first.
    """
    stmt = select(Card, UserCard).join(UserCard, UserCard.card_id == Card.id)
    if q:
        like = f"%{q.lower()}%"
        # naive filter by lower(word/definition); SQLModel portable approach:
        stmt = stmt.where(Card.word.ilike(like) | Card.definition.ilike(like))  # type: ignore[attr-defined]
    stmt = stmt.order_by(Card.id.desc()).limit(limit).offset(offset)

    rows = session.exec(stmt).all()
    out: List[AdminCard] = []
    for card, uc in rows:
        out.append(AdminCard(
            id=card.id,
            word=card.word,
            definition=card.definition,
            bin=uc.bin,
            wrong_count=uc.wrong_count,
            next_review_at=uc.next_review_at.isoformat() if isinstance(uc.next_review_at, datetime) and uc.next_review_at else None,
            status=uc.status,
        ))
    return out

@router.get("/stats", response_model=Stats)
def admin_stats(session: Session = Depends(get_session)):
    """
    Summary counts for admin: totals and per-bin distribution.
    """
    total_cards = session.exec(select(Card)).count()
    statuses = {"active": 0, "never": 0, "hard_to_remember": 0}
    by_bin: Dict[int, int] = {i: 0 for i in range(0, 12)}

    for uc in session.exec(select(UserCard)).all():
        statuses[uc.status] = statuses.get(uc.status, 0) + 1
        if 0 <= uc.bin <= 11:
            by_bin[uc.bin] += 1

    return Stats(
        total_cards=total_cards,
        active=statuses.get("active", 0),
        never=statuses.get("never", 0),
        hard_to_remember=statuses.get("hard_to_remember", 0),
        by_bin=by_bin,
    )

@router.put("/{card_id}", response_model=Card)
def update_card(card_id: int, payload: CardUpdate, session: Session = Depends(get_session)):
    """
    Update a card's word/definition (partial allowed).

    Raises:
        404 if card not found.
    """
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Card not found")

    if payload.word is not None:
        card.word = payload.word
    if payload.definition is not None:
        card.definition = payload.definition

    session.add(card)
    session.commit()
    session.refresh(card)
    return card

@router.delete("/{card_id}")
def delete_card(card_id: int, session: Session = Depends(get_session)):
    """
    Delete a card and its related user/study data (UserCard, Reviews).

    Returns:
        { "ok": true }
    """
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Card not found")

    # Delete dependent rows explicitly (simple cascade).
    session.exec(delete(Review).where(Review.card_id == card_id))
    session.exec(delete(UserCard).where(UserCard.card_id == card_id))
    session.exec(delete(Card).where(Card.id == card_id))
    session.commit()
    return {"ok": True}
