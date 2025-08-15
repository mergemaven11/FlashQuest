from fastapi import APIRouter, Depends, HTTPException
from typing import Any, cast
from sqlmodel import Session, select
from sqlalchemy import func, or_
from app.models import (
    Card,
    CardCreate,
    CardRead,
    CardAdminRead,
    CardUpdate,
    UserCard,
    CardStats,
)
from app.db import get_session  # adjust import if needed

router = APIRouter()
DEFAULT_USER_ID = 1


@router.post("/cards", response_model=CardRead)
def create_card(payload: CardCreate, session: Session = Depends(get_session)):
    """Create a new vocabulary card.

    Args:
        payload (CardCreate): The data for the new card.
        session (Session): The database session.

    Returns:
        CardRead: The newly created card with its assigned ID and timestamp.
    """
    card = Card(**payload.model_dump())
    session.add(card)
    session.commit()
    session.refresh(card)

    # Ensure per-user tracking exists so /cards/admin can include bin/status
    uc = UserCard(
        user_id=DEFAULT_USER_ID, card_id=card.id
    )  # defaults: bin=0, status='active'
    session.add(uc)
    session.commit()

    return card


@router.get("/cards", response_model=list[CardRead])
def list_cards(session: Session = Depends(get_session)):
    """Retrieve all vocabulary cards.

    Args:
        session (Session): The database session.

    Returns:
        list[CardRead]: A list of all cards in the database.
    """
    return session.exec(select(Card)).all()


@router.put("/cards/{card_id}", response_model=CardRead)
def replace_card(
    card_id: int, payload: CardUpdate, session: Session = Depends(get_session)
):
    """PUT: accept partial fields (acts like an upsert-style replace for this API)."""
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(card, k, v)
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


@router.patch("/cards/{card_id}", response_model=CardRead)
def update_card(
    card_id: int, payload: CardUpdate, session: Session = Depends(get_session)
):
    """PATCH: partial update; only provided fields are changed."""
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(card, k, v)
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


@router.delete("/cards/{card_id}")
def delete_card(card_id: int, session: Session = Depends(get_session)):
    """Delete a vocabulary card.

    Args:
        card_id (int): The ID of the card to delete.
        session (Session): The database session.

    Raises:
        HTTPException: If the card does not exist.

    Returns:
        dict: A confirmation message indicating success.
    """
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    session.delete(card)
    session.commit()
    return {"ok": True}


@router.get("/cards/admin", response_model=list[CardAdminRead])
def list_cards_admin(q: str | None = None, session: Session = Depends(get_session)):
    """
    Admin listing: return cards with per-user study fields.
    Supports optional search by `q` matching card.word or card.definition.
    """
    stmt = (
        select(Card, UserCard)
        .join(UserCard, UserCard.card_id == Card.id)
        .where(UserCard.user_id == DEFAULT_USER_ID)
        .order_by(Card.id)
    )

    if q:
        like = f"%{q.lower()}%"
        word_col = cast(Any, Card.word)
        def_col = cast(Any, Card.definition)
        stmt = stmt.where(or_(word_col.ilike(like), def_col.ilike(like)))

    rows = session.exec(stmt).all()

    return [
        CardAdminRead(
            id=card.id,
            word=card.word,
            definition=card.definition,
            created_at=card.created_at,
            bin=uc.bin,
            status=uc.status,
        )
        for card, uc in rows
    ]


@router.get("/cards/stats", response_model=CardStats)
def card_stats(session: Session = Depends(get_session)):
    """
    Return aggregate study stats for the default user:
    - total_cards: number of tracked cards
    - active/never/hard_to_remember: counts by status
    - by_bin: counts per bin (0..11), missing bins reported as 0
    """
    # total cards traced for this user
    total_cards = session.exec(
        select(func.count())
        .select_from(UserCard)
        .where(UserCard.user_id == DEFAULT_USER_ID)
    ).one()

    # counts by status
    status_rows = session.exec(
        select(UserCard.status, func.count())
        .where(UserCard.user_id == DEFAULT_USER_ID)
        .group_by(UserCard.status)
    ).all()
    status_counts = {s: c for s, c in status_rows}
    active = int(status_counts.get("active", 0))
    never = int(status_counts.get("never", 0))
    hard_to_remember = int(status_counts.get("hard_to_remember", 0))

    # counts by bin
    bin_rows = session.exec(
        select(UserCard.bin, func.count())
        .where(UserCard.user_id == DEFAULT_USER_ID)
        .group_by(UserCard.bin)
    ).all()
    by_bin = {i: 0 for i in range(12)}
    for b, c in bin_rows:
        by_bin[int(b)] = int(c)

    return CardStats(
        total_cards=int(total_cards),
        active=active,
        never=never,
        hard_to_remember=hard_to_remember,
        by_bin=by_bin,
    )
