from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import UserCard, Card, Review
from ..crud import next_review_time_for_bin

router = APIRouter(prefix="/study", tags=["study"])

def select_next_card(session: Session):
    """
    Select the next card to review based on spaced repetition rules.

    Priority:
        1. Due cards (bin >= 1) with highest bin first, earliest next_review_at.
        2. New cards from bin 0.
        3. None if no cards available.

    Args:
        session (Session): Database session.

    Returns:
        Optional[Card]: Next card to review or None if none available.
    """
    now = datetime.now(timezone.utc)

    row = session.exec(
        select(UserCard, Card)
        .join(Card, Card.id == UserCard.card_id)
        .where(UserCard.status == "active", UserCard.bin >= 1, UserCard.next_review_at <= now)
        .order_by(UserCard.bin.desc(), UserCard.next_review_at.asc())
        .limit(1)
    ).first()
    if row:
        return row[1]

    row = session.exec(
        select(UserCard, Card)
        .join(Card, Card.id == UserCard.card_id)
        .where(UserCard.status == "active", UserCard.bin == 0)
        .limit(1)
    ).first()
    if row:
        return row[1]

    return None

@router.get("/next")
def next_card(session: Session = Depends(get_session)):
    """
    Retrieve the next card for the study session.

    Args:
        session (Session): Database session.

    Returns:
        dict: Status and card data or completion message.
    """
    card = select_next_card(session)
    if not card:
        active_left = session.exec(select(UserCard).where(UserCard.status == "active")).first()
        if not active_left:
            return {"status": "permanently_done"}
        return {"status": "temporarily_done"}
    return {"status": "ok", "card": {"id": card.id, "word": card.word, "definition": card.definition}}

@router.post("/answer")
def submit_answer(card_id: int, result: str, session: Session = Depends(get_session)):
    """
    Submit an answer for a card and update its spaced repetition state.

    Args:
        card_id (int): ID of the card being answered.
        result (str): 'correct' or 'wrong'.
        session (Session): Database session.

    Returns:
        dict: Operation result including new bin and status.
    """
    uc = session.exec(select(UserCard).where(UserCard.card_id == card_id)).first()
    if not uc:
        raise HTTPException(404, "Card not found")

    from_bin = uc.bin

    if result == "correct":
        uc.bin = min(uc.bin + 1, 11)
    else:
        uc.bin = 1
        uc.wrong_count += 1
        if uc.wrong_count >= 10:
            uc.status = "hard_to_remember"

    uc.next_review_at = next_review_time_for_bin(uc.bin)

    if uc.bin == 11 and uc.status == "active":
        uc.status = "never"

    session.add(Review(card_id=card_id, result=result, from_bin=from_bin, to_bin=uc.bin))
    session.add(uc)
    session.commit()

    return {"ok": True, "to_bin": uc.bin, "status": uc.status}
