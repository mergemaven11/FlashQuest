"""Public featured decks and verified-user deck management."""

from __future__ import annotations

import re
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, delete, select

from ..db import get_session
from ..models import Card, Deck, DeckCreate, DeckRead, DeckUpdate, Review, User, UserCard
from ..security import get_current_user, require_verified_user

router = APIRouter(prefix="/decks", tags=["decks"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "deck"


def _unique_slug(session: Session, title: str, owner_id: int) -> str:
    base = _slugify(title)
    candidate = f"{base}-{owner_id}"
    suffix = 2
    while session.exec(select(Deck.id).where(Deck.slug == candidate)).first() is not None:
        candidate = f"{base}-{owner_id}-{suffix}"
        suffix += 1
    return candidate


def _card_count(session: Session, deck_id: int) -> int:
    count = session.exec(
        select(func.count()).select_from(Card).where(Card.deck_id == deck_id)
    ).one()
    return int(count or 0)


def _read(session: Session, deck: Deck) -> DeckRead:
    return DeckRead(
        id=int(deck.id or 0),
        owner_id=deck.owner_id,
        title=deck.title,
        slug=deck.slug,
        description=deck.description,
        is_builtin=deck.is_builtin,
        card_count=_card_count(session, int(deck.id or 0)),
        created_at=deck.created_at,
    )


def _owned_deck(session: Session, deck_id: int, user_id: int) -> Deck:
    deck = session.get(Deck, deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.owner_id != user_id or deck.is_builtin:
        raise HTTPException(status_code=403, detail="You can only change your own decks")
    return deck


@router.get("/featured", response_model=list[DeckRead])
def featured_decks(session: Session = Depends(get_session)) -> list[DeckRead]:
    """Return public starter/demo decks. Platform Engineering is the first one."""
    decks = session.exec(
        select(Deck).where(Deck.is_builtin == True).order_by(Deck.id)  # noqa: E712
    ).all()
    return [_read(session, deck) for deck in decks]


@router.get("/mine", response_model=list[DeckRead])
def my_decks(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[DeckRead]:
    """Return decks owned by the signed-in user."""
    decks = session.exec(
        select(Deck).where(Deck.owner_id == user.id).order_by(Deck.created_at.desc())  # type: ignore[union-attr]
    ).all()
    return [_read(session, deck) for deck in decks]


@router.post("", response_model=DeckRead, status_code=201)
def create_deck(
    payload: DeckCreate,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> DeckRead:
    """Create an empty reusable study deck for a verified user."""
    title = payload.title.strip()
    if len(title) < 2:
        raise HTTPException(status_code=422, detail="Deck title is too short")
    deck = Deck(
        owner_id=user.id,
        title=title,
        slug=_unique_slug(session, title, int(user.id or 0)),
        description=payload.description.strip(),
        is_builtin=False,
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return _read(session, deck)


@router.patch("/{deck_id}", response_model=DeckRead)
def update_deck(
    deck_id: int,
    payload: DeckUpdate,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> DeckRead:
    """Rename or describe an owned deck."""
    deck = _owned_deck(session, deck_id, int(user.id or 0))
    if payload.title is not None:
        title = payload.title.strip()
        if len(title) < 2:
            raise HTTPException(status_code=422, detail="Deck title is too short")
        deck.title = title
    if payload.description is not None:
        deck.description = payload.description.strip()
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return _read(session, deck)


@router.post("/{deck_id}/copy", response_model=DeckRead, status_code=201)
def copy_featured_deck(
    deck_id: int,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> DeckRead:
    """Copy a featured deck so a user can customize it safely."""
    source = session.get(Deck, deck_id)
    if source is None or not source.is_builtin:
        raise HTTPException(status_code=404, detail="Featured deck not found")

    title = f"{source.title} — My Copy"
    target = Deck(
        owner_id=user.id,
        title=title,
        slug=_unique_slug(session, title, int(user.id or 0)),
        description=source.description,
        is_builtin=False,
    )
    session.add(target)
    session.flush()

    source_cards = session.exec(select(Card).where(Card.deck_id == source.id)).all()
    for source_card in source_cards:
        card = Card(
            deck_id=target.id,
            word=source_card.word,
            definition=source_card.definition,
            topic=title,
            domain=source_card.domain,
            kind=source_card.kind,
            is_builtin=False,
        )
        session.add(card)
        session.flush()
        session.add(UserCard(user_id=user.id, card_id=int(card.id or 0), bin=0))

    session.commit()
    session.refresh(target)
    return _read(session, target)


@router.delete("/{deck_id}")
def delete_deck(
    deck_id: int,
    user: User = Depends(require_verified_user),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    """Delete an owned deck plus its cards, progress, and review history."""
    deck = _owned_deck(session, deck_id, int(user.id or 0))
    card_ids = list(
        session.exec(select(Card.id).where(Card.deck_id == deck.id)).all()
    )
    if card_ids:
        session.exec(delete(Review).where(cast(Any, Review.card_id).in_(card_ids)))
        session.exec(delete(UserCard).where(cast(Any, UserCard.card_id).in_(card_ids)))
        session.exec(delete(Card).where(cast(Any, Card.id).in_(card_ids)))
    session.delete(deck)
    session.commit()
    return {"ok": True}
