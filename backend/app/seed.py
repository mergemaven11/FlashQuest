"""Seed the built-in Platform Engineering concept and lab decks.

Run with Docker:
    docker compose exec api python -m app.seed

The seed operation is idempotent: existing cards are reused and missing
default-user study state is repaired without duplicating content.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from .db import engine
from .models import Card, UserCard

DATA_DIR = Path(__file__).parent / "data"
CONCEPT_DECK_PATH = DATA_DIR / "platform_engineering_cards.json"
LAB_DECK_PATH = DATA_DIR / "platform_engineering_labs.json"


def load_deck(path: Path) -> dict[str, list[tuple[str, str]]]:
    """Load and validate a versioned FlashQuest’s curriculum file."""
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
    """Flatten domain-grouped cards into the database seed order."""
    return [card for cards in domains.values() for card in cards]


PLATFORM_ENGINEERING_DECK_BY_DOMAIN = load_deck(CONCEPT_DECK_PATH)
PLATFORM_ENGINEERING_LABS_BY_DOMAIN = load_deck(LAB_DECK_PATH)
PLATFORM_ENGINEERING_CONCEPT_DECK = flatten_deck(PLATFORM_ENGINEERING_DECK_BY_DOMAIN)
PLATFORM_ENGINEERING_LAB_DECK = flatten_deck(PLATFORM_ENGINEERING_LABS_BY_DOMAIN)
PLATFORM_ENGINEERING_DECK = (
    PLATFORM_ENGINEERING_CONCEPT_DECK + PLATFORM_ENGINEERING_LAB_DECK
)

if len({prompt for prompt, _ in PLATFORM_ENGINEERING_DECK}) != len(
    PLATFORM_ENGINEERING_DECK
):
    raise ValueError("Duplicate prompts exist across concept and lab decks")


def seed_platform_deck(session: Session) -> dict[str, int]:
    """Insert the complete Platform Engineering deck and default-user study state."""
    existing_cards = {card.word: card for card in session.exec(select(Card)).all()}
    existing_progress_ids = set(
        session.exec(select(UserCard.card_id).where(UserCard.user_id == 1)).all()
    )

    inserted_cards = 0
    existing_count = 0
    created_progress = 0

    for prompt, answer in PLATFORM_ENGINEERING_DECK:
        card = existing_cards.get(prompt)
        if card is None:
            card = Card(word=prompt, definition=answer)
            session.add(card)
            session.flush()
            existing_cards[prompt] = card
            inserted_cards += 1
        else:
            existing_count += 1

        if card.id is not None and card.id not in existing_progress_ids:
            session.add(UserCard(card_id=card.id, user_id=1, bin=0))
            existing_progress_ids.add(card.id)
            created_progress += 1

    session.commit()
    return {
        "deck_size": len(PLATFORM_ENGINEERING_DECK),
        "concept_cards": len(PLATFORM_ENGINEERING_CONCEPT_DECK),
        "lab_cards": len(PLATFORM_ENGINEERING_LAB_DECK),
        "inserted_cards": inserted_cards,
        "existing_cards": existing_count,
        "created_progress": created_progress,
    }


def run() -> None:
    """Seed the configured database and print a compact result summary."""
    with Session(engine) as session:
        result = seed_platform_deck(session)

    print(
        "FlashQuest’s Platform Engineering deck ready: "
        f"{result['deck_size']} cards "
        f"({result['concept_cards']} concepts + {result['lab_cards']} labs; "
        f"{result['inserted_cards']} inserted, "
        f"{result['existing_cards']} already present, "
        f"{result['created_progress']} progress rows created)."
    )


if __name__ == "__main__":
    run()
