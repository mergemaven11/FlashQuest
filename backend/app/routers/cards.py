from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from typing import List, Dict, Any
from datetime import datetime
from ..db import get_session
from ..models import Card, UserCard

router = APIRouter(prefix="/cards", tags=["cards"])

@router.post("", response_model=Card)
def create_card(card: Card, session: Session = Depends(get_session)):
    """
    Create a new vocabulary card and initialize its user tracking.

    Args:
        card (Card): Card object containing 'word' and 'definition'.
        session (Session): SQLModel database session.

    Returns:
        Card: The created card with database-generated fields populated.
    """
    session.add(card)
    session.commit()
    session.refresh(card)
    session.add(UserCard(card_id=card.id, bin=0))
    session.commit()
    return card

@router.get("", response_model=list[Card])
def list_cards(session: Session = Depends(get_session)):
    """
    Retrieve all vocabulary cards.

    Args:
        session (Session): SQLModel database session.

    Returns:
        list[Card]: All cards sorted by most recent creation first.
    """
    return session.exec(select(Card).order_by(Card.id.desc())).all()

@router.get("/admin", response_model=List[Dict[str, Any]])
def list_cards_admin(session: Session = Depends(get_session)):
    """
    List cards with user-study status for the admin view.

    Returns:
        List[dict]: Each item includes card fields plus bin, wrong_count, next_review_at, and status.
    """
    rows = session.exec(
        select(Card, UserCard).join(UserCard, UserCard.card_id == Card.id)
        .order_by(Card.id.desc())
    ).all()

    out: List[Dict[str, Any]] = []
    for card, uc in rows:
        out.append({
            "id": card.id,
            "word": card.word,
            "definition": card.definition,
            "bin": uc.bin,
            "wrong_count": uc.wrong_count,
            "next_review_at": uc.next_review_at.isoformat() if isinstance(uc.next_review_at, datetime) and uc.next_review_at else None,
            "status": uc.status,
        })
    return out