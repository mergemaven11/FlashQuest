"""Seed the built-in Platform Engineering concept and lab deck.

Run with Docker:
    docker compose exec api python -m app.seed

The seed operation is idempotent: the featured deck and cards are reused,
metadata is repaired, and missing anonymous-demo study state is created without
duplicates.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from .db import engine
from .models import Card, Deck, UserCard

DATA_DIR = Path(__file__).parent / "data"
CONCEPT_DECK_PATH = DATA_DIR / "platform_engineering_cards.json"
LAB_DECK_PATH = DATA_DIR / "platform_engineering_labs.json"
PLATFORM_TOPIC = "Platform Engineering"
PLATFORM_SLUG = "platform-engineering"
DEMO_USER_ID = 0


def load_deck(path: Path) -> dict[str, list[tuple[str, str]]]:
    """Load and validate a versioned FlashQuest curriculum file."""
    payload: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    domains: dict[str, list[tuple[str, str]]] = {}
    prompts: set[str] = set()

    for domain in payload.get("domains", []):
        name = str(domain["name"])
        cards: list[tuple[str, str]] = []
        for card in domain.get("cards", []):
            prompt = str(card["prompt"]).strip()
            answer = str(card["answer"]).strip()
            if not prompt or not answer:
                raise ValueError(f"Empty prompt or answer in domain: {name}")
            if prompt in prompts:
                raise ValueError(f"Duplicate study prompt in {path.name}: {prompt}")
            prompts.add(prompt)
            cards.append((prompt, answer))
        domains[name] = cards

    expected = int(payload.get("card_count", 0))
    actual = sum(len(cards) for cards in domains.values())
    if actual != expected:
        raise ValueError(
            f"Curriculum card_count mismatch in {path.name}: "
            f"expected {expected}, found {actual}"
        )

    return domains


def flatten_deck(
    domains: dict[str, list[tuple[str, str]]],
) -> list[tuple[str, str]]:
    """Flatten domain-grouped cards into database seed order."""
    return [card for cards in domains.values() for card in cards]


def deck_metadata(
    domains: dict[str, list[tuple[str, str]]], kind: str
) -> dict[str, tuple[str, str]]:
    """Map each prompt to its domain and learning mode."""
    return {
        prompt: (domain, kind)
        for domain, cards in domains.items()
        for prompt, _answer in cards
    }


PLATFORM_ENGINEERING_DECK_BY_DOMAIN = load_deck(CONCEPT_DECK_PATH)
PLATFORM_ENGINEERING_LABS_BY_DOMAIN = load_deck(LAB_DECK_PATH)
PLATFORM_ENGINEERING_CONCEPT_DECK = flatten_deck(PLATFORM_ENGINEERING_DECK_BY_DOMAIN)
PLATFORM_ENGINEERING_LAB_DECK = flatten_deck(PLATFORM_ENGINEERING_LABS_BY_DOMAIN)
PLATFORM_ENGINEERING_DECK = (
    PLATFORM_ENGINEERING_CONCEPT_DECK + PLATFORM_ENGINEERING_LAB_DECK
)
PLATFORM_ENGINEERING_METADATA = {
    **deck_metadata(PLATFORM_ENGINEERING_DECK_BY_DOMAIN, "concept"),
    **deck_metadata(PLATFORM_ENGINEERING_LABS_BY_DOMAIN, "lab"),
}

if len({prompt for prompt, _ in PLATFORM_ENGINEERING_DECK}) != len(
    PLATFORM_ENGINEERING_DECK
):
    raise ValueError("Duplicate prompts exist across concept and lab decks")


def _featured_deck(session: Session) -> Deck:
    """Create or repair the public featured Platform Engineering deck."""
    deck = session.exec(select(Deck).where(Deck.slug == PLATFORM_SLUG)).first()
    description = (
        "216 Platform Engineering challenges: 144 concepts and 72 hands-on "
        "break/fix labs across 12 domains."
    )
    if deck is None:
        deck = Deck(
            owner_id=None,
            title=PLATFORM_TOPIC,
            slug=PLATFORM_SLUG,
            description=description,
            is_builtin=True,
        )
        session.add(deck)
        session.flush()
    else:
        deck.owner_id = None
        deck.title = PLATFORM_TOPIC
        deck.description = description
        deck.is_builtin = True
        session.add(deck)
        session.flush()
    return deck


def seed_platform_deck(session: Session) -> dict[str, int]:
    """Insert or repair the built-in Platform Engineering demo deck."""
    deck = _featured_deck(session)
    existing_cards = {card.word: card for card in session.exec(select(Card)).all()}
    existing_progress_ids = set(
        session.exec(
            select(UserCard.card_id).where(UserCard.user_id == DEMO_USER_ID)
        ).all()
    )

    inserted_cards = 0
    existing_count = 0
    updated_cards = 0
    created_progress = 0

    for prompt, answer in PLATFORM_ENGINEERING_DECK:
        domain, kind = PLATFORM_ENGINEERING_METADATA[prompt]
        card = existing_cards.get(prompt)
        if card is None:
            card = Card(
                deck_id=deck.id,
                word=prompt,
                definition=answer,
                topic=PLATFORM_TOPIC,
                domain=domain,
                kind=kind,
                is_builtin=True,
            )
            session.add(card)
            session.flush()
            existing_cards[prompt] = card
            inserted_cards += 1
        else:
            existing_count += 1
            desired = {
                "deck_id": deck.id,
                "definition": answer,
                "topic": PLATFORM_TOPIC,
                "domain": domain,
                "kind": kind,
                "is_builtin": True,
            }
            changed = False
            for field, value in desired.items():
                if getattr(card, field) != value:
                    setattr(card, field, value)
                    changed = True
            if changed:
                session.add(card)
                updated_cards += 1

        if card.id is not None and card.id not in existing_progress_ids:
            session.add(UserCard(card_id=card.id, user_id=DEMO_USER_ID, bin=0))
            existing_progress_ids.add(card.id)
            created_progress += 1

    session.commit()
    return {
        "deck_id": int(deck.id or 0),
        "deck_size": len(PLATFORM_ENGINEERING_DECK),
        "concept_cards": len(PLATFORM_ENGINEERING_CONCEPT_DECK),
        "lab_cards": len(PLATFORM_ENGINEERING_LAB_DECK),
        "inserted_cards": inserted_cards,
        "existing_cards": existing_count,
        "updated_cards": updated_cards,
        "created_progress": created_progress,
    }


def run() -> None:
    """Seed the configured database and print a compact result summary."""
    with Session(engine) as session:
        result = seed_platform_deck(session)

    print(
        "FlashQuest’s featured Platform Engineering deck ready: "
        f"{result['deck_size']} cards "
        f"({result['concept_cards']} concepts + {result['lab_cards']} labs; "
        f"{result['inserted_cards']} inserted, "
        f"{result['updated_cards']} metadata repaired, "
        f"{result['existing_cards']} already present, "
        f"{result['created_progress']} demo progress rows created)."
    )


if __name__ == "__main__":
    run()
