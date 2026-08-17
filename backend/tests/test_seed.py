"""Tests for the built-in Platform Engineering study deck."""
from sqlmodel import select

from app.models import Card, UserCard
from app.seed import (
    PLATFORM_ENGINEERING_DECK,
    PLATFORM_ENGINEERING_DECK_BY_DOMAIN,
    seed_platform_deck,
)


def test_platform_deck_has_144_unique_balanced_cards():
    assert len(PLATFORM_ENGINEERING_DECK_BY_DOMAIN) == 12
    assert all(
        len(cards) == 12
        for cards in PLATFORM_ENGINEERING_DECK_BY_DOMAIN.values()
    )
    assert len(PLATFORM_ENGINEERING_DECK) == 144

    prompts = [prompt for prompt, _ in PLATFORM_ENGINEERING_DECK]
    assert len(set(prompts)) == 144


def test_seed_platform_deck_is_idempotent(sqlite_session):
    first = seed_platform_deck(sqlite_session)
    assert first["deck_size"] == 144
    assert first["inserted_cards"] == 144
    assert first["created_progress"] == 144

    assert len(sqlite_session.exec(select(Card)).all()) == 144
    assert len(sqlite_session.exec(select(UserCard)).all()) == 144

    second = seed_platform_deck(sqlite_session)
    assert second["inserted_cards"] == 0
    assert second["existing_cards"] == 144
    assert second["created_progress"] == 0

    assert len(sqlite_session.exec(select(Card)).all()) == 144
    assert len(sqlite_session.exec(select(UserCard)).all()) == 144
