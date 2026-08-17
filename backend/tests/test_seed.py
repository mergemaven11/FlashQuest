"""Tests for the built-in Platform Engineering concept and lab decks."""
from sqlmodel import select

from app.models import Card, UserCard
from app.seed import (
    PLATFORM_ENGINEERING_CONCEPT_DECK,
    PLATFORM_ENGINEERING_DECK,
    PLATFORM_ENGINEERING_DECK_BY_DOMAIN,
    PLATFORM_ENGINEERING_LAB_DECK,
    PLATFORM_ENGINEERING_LABS_BY_DOMAIN,
    seed_platform_deck,
)


def test_platform_deck_has_216_unique_balanced_cards():
    assert len(PLATFORM_ENGINEERING_DECK_BY_DOMAIN) == 12
    assert all(
        len(cards) == 12
        for cards in PLATFORM_ENGINEERING_DECK_BY_DOMAIN.values()
    )
    assert len(PLATFORM_ENGINEERING_CONCEPT_DECK) == 144

    assert len(PLATFORM_ENGINEERING_LABS_BY_DOMAIN) == 12
    assert all(
        len(cards) == 6
        for cards in PLATFORM_ENGINEERING_LABS_BY_DOMAIN.values()
    )
    assert len(PLATFORM_ENGINEERING_LAB_DECK) == 72

    assert len(PLATFORM_ENGINEERING_DECK) == 216
    prompts = [prompt for prompt, _ in PLATFORM_ENGINEERING_DECK]
    assert len(set(prompts)) == 216


def test_lab_cards_are_scenario_driven():
    prompts = [prompt for prompt, _ in PLATFORM_ENGINEERING_LAB_DECK]
    assert all(prompt.startswith("LAB ·") for prompt in prompts)
    assert any("broken" in prompt.lower() for prompt in prompts)
    assert any("fix" in prompt.lower() for prompt in prompts)
    assert any("set" in prompt.lower() or "design" in prompt.lower() for prompt in prompts)


def test_seed_platform_deck_is_idempotent(sqlite_session):
    first = seed_platform_deck(sqlite_session)
    assert first["deck_size"] == 216
    assert first["concept_cards"] == 144
    assert first["lab_cards"] == 72
    assert first["inserted_cards"] == 216
    assert first["created_progress"] == 216

    assert len(sqlite_session.exec(select(Card)).all()) == 216
    assert len(sqlite_session.exec(select(UserCard)).all()) == 216

    second = seed_platform_deck(sqlite_session)
    assert second["inserted_cards"] == 0
    assert second["existing_cards"] == 216
    assert second["created_progress"] == 0

    assert len(sqlite_session.exec(select(Card)).all()) == 216
    assert len(sqlite_session.exec(select(UserCard)).all()) == 216
