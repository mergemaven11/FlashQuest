# app/routers/cards.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, or_, update
from sqlmodel import Session, select, delete

from app.db import get_session
from app.models import (
    Card,
    CardCreate,
    CardRead,
    CardAdminRead,
    CardUpdate,
    UserCard,
    CardStats,
    Review,
)

router = APIRouter()
DEFAULT_USER_ID = 1


@router.post("/cards", response_model=CardRead)
def create_card(
    payload: CardCreate, session: Session = Depends(get_session)
) -> CardRead:
    """Create a new vocabulary card and initialize user tracking.

    Args:
        payload: The data for the new card.
        session: Database session.

    Returns:
        The newly created card (with ID and timestamps).
    """
    card = Card(**payload.model_dump())
    session.add(card)
    session.commit()
    session.refresh(card)

    # Ensure per-user tracking exists so /cards/admin can include bin/status.
    uc = UserCard(user_id=DEFAULT_USER_ID, card_id=card.id)  # bin=0, status='active'
    session.add(uc)
    session.commit()

    return card


@router.get("/cards", response_model=List[CardRead])
def list_cards(session: Session = Depends(get_session)) -> List[CardRead]:
    """Retrieve all vocabulary cards.

    Args:
        session: Database session.

    Returns:
        All cards in the database.
    """
    rows = session.exec(select(Card).order_by(asc(cast(Any, Card.id)))).all()
    return list(rows)


@router.put("/cards/{card_id}", response_model=CardRead)
def replace_card(
    card_id: int, payload: CardUpdate, session: Session = Depends(get_session)
) -> CardRead:
    """Replace a card's fields (acts like an upsert-style full update for this API).

    Args:
        card_id: The card ID to replace.
        payload: Fields to set on the card (missing fields are left as-is).
        session: Database session.

    Raises:
        HTTPException: If the card does not exist.

    Returns:
        The updated card.
    """
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
) -> CardRead:
    """Partially update a card (only provided fields are changed).

    Args:
        card_id: The card ID to update.
        payload: Partial fields to change.
        session: Database session.

    Raises:
        HTTPException: If the card does not exist.

    Returns:
        The updated card.
    """
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
def delete_card(
    card_id: int, session: Session = Depends(get_session)
) -> Dict[str, bool]:
    """Delete a vocabulary card (and its user tracking rows).

    Args:
        card_id: The ID of the card to delete.
        session: Database session.

    Raises:
        HTTPException: If the card does not exist.

    Returns:
        Confirmation message indicating success.
    """
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Remove user mappings first.
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
        None, description="Case-insensitive search over word/definition"
    ),
    session: Session = Depends(get_session),
) -> List[CardAdminRead]:
    """Admin listing: return cards with per-user study fields.

    Supports optional search by ``q`` matching Card.word or Card.definition.

    Args:
        q: Optional query string for case-insensitive search.
        session: Database session.

    Returns:
        A list of cards augmented with ``bin`` and ``status`` for the default user.
    """
    stmt = (
        select(Card, UserCard)
        .join(UserCard, cast(Any, UserCard.card_id) == cast(Any, Card.id))
        .where(UserCard.user_id == DEFAULT_USER_ID)
    )

    if q:
        like = f"%{q.lower()}%"
        word_col = cast(Any, Card.word)
        def_col = cast(Any, Card.definition)
        stmt = stmt.where(or_(word_col.ilike(like), def_col.ilike(like)))

    # Newest first (by id); cast for mypy/SQLAlchemy typing harmony.
    stmt = stmt.order_by(desc(cast(Any, Card.id)))
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
def card_stats(session: Session = Depends(get_session)) -> CardStats:
    """Return aggregate study stats for the default user.

    Includes:
      * ``total_cards``: number of tracked cards for this user
      * ``active`` / ``never`` / ``hard_to_remember``: counts by status
      * ``by_bin``: counts per bin (0..11), with missing bins reported as 0

    Args:
        session: Database session.

    Returns:
        Aggregated statistics for the default user.
    """
    total_cards = session.exec(
        select(func.count())
        .select_from(UserCard)
        .where(UserCard.user_id == DEFAULT_USER_ID)
    ).one()

    # Counts by status (single grouped query)
    status_rows = session.exec(
        select(UserCard.status, func.count())
        .where(UserCard.user_id == DEFAULT_USER_ID)
        .group_by(UserCard.status)
    ).all()
    status_counts: Dict[str, int] = {str(s): int(c) for s, c in status_rows}

    # Counts by bin (0..11)
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
def reset_all_progress(session: Session = Depends(get_session)):
    """
    Reset ALL progress for the default user:

    - ensure a UserCard exists for every Card
    - delete all Review rows for the user
    - set UserCard: bin=0, wrong_count=0, next_review_at=NULL, status='active'
    Returns basic counts for UI feedback.
    """
    # Ensure a UserCard exists for every Card
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

    # Delete all reviews for the user
    deleted_reviews = (
        session.exec(delete(Review).where(Review.user_id == DEFAULT_USER_ID)).rowcount
        or 0
    )

    # Reset all usercards
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
