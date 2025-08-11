from fastapi import APIRouter, Depends
from sqlmodel import Session, select
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
