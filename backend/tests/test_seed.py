"""Tests for FlashQuest's versioned Official curriculum registry."""

from sqlmodel import select

from app.models import Card, Deck, User, UserCard
from app.room_models import RoomMember, RoomMessage, StudyRoom
from app.seed import (
    DEMO_USER_ID,
    OFFICIAL_CURRICULA,
    PLATFORM_ENGINEERING_CONCEPT_DECK,
    PLATFORM_ENGINEERING_DECK,
    PLATFORM_ENGINEERING_DECK_BY_DOMAIN,
    PLATFORM_ENGINEERING_LAB_DECK,
    PLATFORM_ENGINEERING_LABS_BY_DOMAIN,
    load_deck,
    seed_all_curricula,
    seed_demo_room,
    seed_platform_deck,
)
from app.security import (
    DEMO_DISPLAY_NAME,
    DEMO_GUIDE_EMAIL,
    DEMO_LOGIN_EMAIL,
    DEMO_LOGIN_PASSWORD,
    DEMO_ROOM_NAME,
    verify_password,
)


def test_platform_deck_has_216_unique_balanced_cards():
    assert len(PLATFORM_ENGINEERING_DECK_BY_DOMAIN) == 12
    assert all(
        len(cards) == 12 for cards in PLATFORM_ENGINEERING_DECK_BY_DOMAIN.values()
    )
    assert len(PLATFORM_ENGINEERING_CONCEPT_DECK) == 144

    assert len(PLATFORM_ENGINEERING_LABS_BY_DOMAIN) == 12
    assert all(
        len(cards) == 6 for cards in PLATFORM_ENGINEERING_LABS_BY_DOMAIN.values()
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
    assert any(
        "set" in prompt.lower() or "design" in prompt.lower() for prompt in prompts
    )


def test_official_registry_contains_expected_subject_packs():
    assert [spec.slug for spec in OFFICIAL_CURRICULA] == [
        "platform-engineering",
        "docker-fundamentals",
        "linux-fundamentals",
        "math-fundamentals",
        "accounting-fundamentals",
        "intro-us-law",
    ]
    assert {spec.subject for spec in OFFICIAL_CURRICULA} >= {
        "Technology",
        "Mathematics",
        "Accounting",
        "Law",
    }


def test_new_starter_curricula_are_30_card_balanced_packs():
    for spec in OFFICIAL_CURRICULA[1:]:
        source = spec.sources[0]
        domains = load_deck(source.path)
        assert len(domains) == 5
        assert all(len(cards) == 6 for cards in domains.values())
        cards = [card for domain_cards in domains.values() for card in domain_cards]
        assert len(cards) == 30
        prompts = [prompt for prompt, _answer in cards]
        assert len(set(prompts)) == 30
        assert all(len(answer) <= 500 for _prompt, answer in cards)


def test_law_curriculum_carries_scope_and_advice_boundary():
    law = next(spec for spec in OFFICIAL_CURRICULA if spec.slug == "intro-us-law")
    description = law.description.lower()
    assert "not legal advice" in description
    assert "jurisdiction" in description

    domains = load_deck(law.sources[0].path)
    prompts_and_answers = " ".join(
        f"{prompt} {answer}" for cards in domains.values() for prompt, answer in cards
    ).lower()
    assert "not legal advice" in prompts_and_answers
    assert "jurisdiction" in prompts_and_answers


def test_seed_platform_deck_is_idempotent_and_protected(sqlite_session):
    first = seed_platform_deck(sqlite_session)
    assert first["deck_size"] == 216
    assert first["concept_cards"] == 144
    assert first["lab_cards"] == 72
    assert first["inserted_cards"] == 216
    assert first["created_progress"] == 216

    decks = sqlite_session.exec(select(Deck)).all()
    assert len(decks) == 1
    assert decks[0].title == "Platform Engineering"
    assert decks[0].slug == "platform-engineering"
    assert decks[0].is_builtin is True
    assert decks[0].owner_id is None
    assert decks[0].visibility == "public"

    cards = sqlite_session.exec(select(Card)).all()
    progress = sqlite_session.exec(select(UserCard)).all()
    assert len(cards) == 216
    assert len(progress) == 216
    assert all(row.user_id == DEMO_USER_ID for row in progress)
    assert all(card.deck_id == decks[0].id for card in cards)
    assert all(card.topic == "Platform Engineering" for card in cards)
    assert all(card.is_builtin for card in cards)
    assert sum(card.kind == "concept" for card in cards) == 144
    assert sum(card.kind == "lab" for card in cards) == 72
    assert len({card.domain for card in cards}) >= 12

    second = seed_platform_deck(sqlite_session)
    assert second["inserted_cards"] == 0
    assert second["existing_cards"] == 216
    assert second["updated_cards"] == 0
    assert second["created_progress"] == 0

    assert len(sqlite_session.exec(select(Deck)).all()) == 1
    assert len(sqlite_session.exec(select(Card)).all()) == 216
    assert len(sqlite_session.exec(select(UserCard)).all()) == 216


def test_seed_all_curricula_is_idempotent_and_library_ready(sqlite_session):
    first = seed_all_curricula(sqlite_session)
    assert len(first) == 6
    assert sum(int(result["deck_size"]) for result in first) == 366
    assert sum(int(result["inserted_cards"]) for result in first) == 366

    decks = sqlite_session.exec(select(Deck).order_by(Deck.id)).all()
    cards = sqlite_session.exec(select(Card)).all()
    progress = sqlite_session.exec(select(UserCard)).all()

    assert len(decks) == 6
    assert len(cards) == 366
    assert len(progress) == 366
    assert all(deck.is_builtin for deck in decks)
    assert all(deck.visibility == "public" for deck in decks)
    assert all(deck.published_at is not None for deck in decks)
    assert all(deck.owner_id is None for deck in decks)
    assert {deck.slug for deck in decks} == {spec.slug for spec in OFFICIAL_CURRICULA}

    starter_decks = [deck for deck in decks if deck.slug != "platform-engineering"]
    assert all(
        len([card for card in cards if card.deck_id == deck.id]) == 30
        for deck in starter_decks
    )

    second = seed_all_curricula(sqlite_session)
    assert sum(int(result["inserted_cards"]) for result in second) == 0
    assert sum(int(result["updated_cards"]) for result in second) == 0
    assert sum(int(result["created_progress"]) for result in second) == 0
    assert sum(int(result["existing_cards"]) for result in second) == 366

    assert len(sqlite_session.exec(select(Deck)).all()) == 6
    assert len(sqlite_session.exec(select(Card)).all()) == 366
    assert len(sqlite_session.exec(select(UserCard)).all()) == 366


def test_seeded_official_packs_appear_in_library_discovery(client, sqlite_session):
    seed_all_curricula(sqlite_session)

    response = client.get(
        "/decks/library",
        params={"source": "official", "page_size": 20, "sort": "title"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 6
    assert {item["slug"] for item in payload["items"]} == {
        spec.slug for spec in OFFICIAL_CURRICULA
    }
    assert all(item["is_official"] is True for item in payload["items"])
    assert all(item["visibility"] == "public" for item in payload["items"])


def test_seed_scopes_prompt_identity_to_each_deck(sqlite_session):
    """A second seed must never move cards between curricula."""
    first, second = OFFICIAL_CURRICULA[1], OFFICIAL_CURRICULA[2]
    seed_all_curricula(sqlite_session)

    first_deck = sqlite_session.exec(select(Deck).where(Deck.slug == first.slug)).one()
    second_deck = sqlite_session.exec(
        select(Deck).where(Deck.slug == second.slug)
    ).one()
    first_card = sqlite_session.exec(
        select(Card).where(Card.deck_id == first_deck.id)
    ).first()
    second_card = sqlite_session.exec(
        select(Card).where(Card.deck_id == second_deck.id)
    ).first()

    assert first_card is not None and second_card is not None
    original_first_deck_id = first_card.deck_id
    original_second_deck_id = second_card.deck_id

    seed_all_curricula(sqlite_session)
    sqlite_session.refresh(first_card)
    sqlite_session.refresh(second_card)
    assert first_card.deck_id == original_first_deck_id
    assert second_card.deck_id == original_second_deck_id


def test_seed_demo_room_is_login_ready_idempotent_and_non_creator(client, sqlite_session):
    seed_all_curricula(sqlite_session)
    first = seed_demo_room(sqlite_session)

    demo = sqlite_session.exec(select(User).where(User.email == DEMO_LOGIN_EMAIL)).one()
    guide = sqlite_session.exec(select(User).where(User.email == DEMO_GUIDE_EMAIL)).one()
    room = sqlite_session.exec(
        select(StudyRoom).where(StudyRoom.name == DEMO_ROOM_NAME)
    ).one()
    members = sqlite_session.exec(
        select(RoomMember).where(RoomMember.room_id == room.id).order_by(RoomMember.user_id)
    ).all()
    messages = sqlite_session.exec(
        select(RoomMessage).where(RoomMessage.room_id == room.id).order_by(RoomMessage.id)
    ).all()

    assert demo.display_name == DEMO_DISPLAY_NAME
    assert demo.is_verified is True
    assert verify_password(DEMO_LOGIN_PASSWORD, demo.password_hash) is True
    assert guide.is_verified is True
    assert verify_password(DEMO_LOGIN_PASSWORD, guide.password_hash) is False
    assert room.visibility == "private"
    assert room.status == "open"
    assert room.host_user_id == guide.id
    assert {(member.user_id, member.role, member.status) for member in members} == {
        (guide.id, "host", "active"),
        (demo.id, "member", "active"),
    }
    assert len(messages) == 3
    assert all(message.user_id == guide.id for message in messages)
    assert first["created_messages"] == 3

    login = client.post(
        "/auth/login",
        json={"email": DEMO_LOGIN_EMAIL, "password": DEMO_LOGIN_PASSWORD},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    mine = client.get("/rooms/mine", headers=headers)
    assert mine.status_code == 200
    assert [item["name"] for item in mine.json()] == [DEMO_ROOM_NAME]

    create_room = client.post(
        "/rooms",
        json={
            "deck_id": room.deck_id,
            "name": "Should not exist",
            "visibility": "private",
        },
        headers=headers,
    )
    assert create_room.status_code == 403

    create_deck = client.post(
        "/decks",
        json={
            "title": "Should not exist",
            "description": "demo sandbox",
            "subject": "Testing",
            "difficulty": "beginner",
            "tags": [],
        },
        headers=headers,
    )
    assert create_deck.status_code == 403

    second = seed_demo_room(sqlite_session)
    assert second["room_id"] == first["room_id"]
    assert second["demo_user_id"] == first["demo_user_id"]
    assert second["created_messages"] == 0
    assert len(
        sqlite_session.exec(
            select(StudyRoom).where(StudyRoom.name == DEMO_ROOM_NAME)
        ).all()
    ) == 1
    assert len(
        sqlite_session.exec(
            select(RoomMessage).where(RoomMessage.room_id == room.id)
        ).all()
    ) == 3
