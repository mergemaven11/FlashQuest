"""Seed FlashQuest Official curricula and the safe Quest Room demo.

Run with Docker:
    docker compose exec api python -m app.seed

The registry is intentionally data-driven: each curriculum is versioned JSON,
validated before use, and seeded idempotently. Official decks are repaired in
place while user-created decks are never touched.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from .db import engine
from .models import Card, Deck, User, UserCard, utc_now
from .room_models import RoomMember, RoomMessage, StudyRoom
from .security import (
    DEMO_DISPLAY_NAME,
    DEMO_GUIDE_EMAIL,
    DEMO_GUIDE_NAME,
    DEMO_LOGIN_EMAIL,
    DEMO_LOGIN_PASSWORD,
    DEMO_ROOM_NAME,
    hash_password,
    verify_password,
)

DATA_DIR = Path(__file__).parent / "data"
CONCEPT_DECK_PATH = DATA_DIR / "platform_engineering_cards.json"
LAB_DECK_PATH = DATA_DIR / "platform_engineering_labs.json"
DEMO_USER_ID = 0


@dataclass(frozen=True)
class CurriculumSource:
    """One versioned curriculum file and the card kind it represents."""

    path: Path
    kind: str = "concept"


@dataclass(frozen=True)
class CurriculumSpec:
    """Registry metadata for one protected FlashQuest Official deck."""

    slug: str
    title: str
    description: str
    subject: str
    difficulty: str
    tags: tuple[str, ...]
    sources: tuple[CurriculumSource, ...]


def load_deck(path: Path) -> dict[str, list[tuple[str, str]]]:
    """Load and validate one versioned FlashQuest curriculum file."""
    payload: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    version = int(payload.get("version", 0))
    if version < 1:
        raise ValueError(f"Curriculum {path.name} must declare version >= 1")

    domains: dict[str, list[tuple[str, str]]] = {}
    prompts: set[str] = set()

    for domain in payload.get("domains", []):
        name = str(domain["name"]).strip()
        if not name:
            raise ValueError(f"Empty domain name in {path.name}")
        if name in domains:
            raise ValueError(f"Duplicate domain in {path.name}: {name}")

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
    if actual < 1:
        raise ValueError(f"Curriculum {path.name} must contain at least one card")

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

PLATFORM_ENGINEERING_SPEC = CurriculumSpec(
    slug="platform-engineering",
    title="Platform Engineering",
    description=(
        "216 Platform Engineering challenges: 144 concepts and 72 hands-on "
        "break/fix labs across 12 domains."
    ),
    subject="Technology",
    difficulty="intermediate",
    tags=("platform engineering", "devops", "cloud", "sre"),
    sources=(
        CurriculumSource(CONCEPT_DECK_PATH, "concept"),
        CurriculumSource(LAB_DECK_PATH, "lab"),
    ),
)

OFFICIAL_CURRICULA: tuple[CurriculumSpec, ...] = (
    PLATFORM_ENGINEERING_SPEC,
    CurriculumSpec(
        slug="docker-fundamentals",
        title="Docker Fundamentals",
        description="30 beginner-friendly Docker concepts covering containers, images, builds, storage, networking, Compose, and everyday operations.",
        subject="Technology",
        difficulty="beginner",
        tags=("docker", "containers", "devops", "images"),
        sources=(CurriculumSource(DATA_DIR / "docker_fundamentals.json"),),
    ),
    CurriculumSpec(
        slug="linux-fundamentals",
        title="Linux Fundamentals",
        description="30 core Linux concepts covering files, permissions, processes, services, shell tools, networking, packages, and troubleshooting.",
        subject="Technology",
        difficulty="beginner",
        tags=("linux", "shell", "operating systems", "cli"),
        sources=(CurriculumSource(DATA_DIR / "linux_fundamentals.json"),),
    ),
    CurriculumSpec(
        slug="math-fundamentals",
        title="Math Fundamentals",
        description="30 approachable math foundations spanning number sense, fractions, percentages, algebra, geometry, measurement, data, and probability.",
        subject="Mathematics",
        difficulty="beginner",
        tags=("math", "algebra", "fractions", "probability"),
        sources=(CurriculumSource(DATA_DIR / "math_fundamentals.json"),),
    ),
    CurriculumSpec(
        slug="accounting-fundamentals",
        title="Accounting Fundamentals",
        description="30 foundational accounting concepts covering the accounting equation, debits and credits, financial statements, accruals, inventory, cash, and basic analysis.",
        subject="Accounting",
        difficulty="beginner",
        tags=("accounting", "bookkeeping", "financial statements", "business"),
        sources=(CurriculumSource(DATA_DIR / "accounting_fundamentals.json"),),
    ),
    CurriculumSpec(
        slug="intro-us-law",
        title="Intro to U.S. Law",
        description=(
            "30 general educational concepts about the U.S. legal system, constitutional structure, civil and criminal law, contracts, torts, and legal process. "
            "Laws vary by jurisdiction and change over time; this study deck is not legal advice."
        ),
        subject="Law",
        difficulty="beginner",
        tags=("law", "us law", "legal concepts", "civics"),
        sources=(CurriculumSource(DATA_DIR / "intro_us_law.json"),),
    ),
)


def _curriculum_rows(
    spec: CurriculumSpec,
) -> list[tuple[str, str, str, str]]:
    """Return prompt, answer, domain, kind rows and reject cross-source duplicates."""
    rows: list[tuple[str, str, str, str]] = []
    prompts: set[str] = set()
    for source in spec.sources:
        domains = load_deck(source.path)
        for domain, cards in domains.items():
            for prompt, answer in cards:
                if prompt in prompts:
                    raise ValueError(
                        f"Duplicate prompt across sources for {spec.slug}: {prompt}"
                    )
                prompts.add(prompt)
                rows.append((prompt, answer, domain, source.kind))
    return rows


def _official_deck(session: Session, spec: CurriculumSpec) -> Deck:
    """Create or repair one public protected Official deck."""
    deck = session.exec(select(Deck).where(Deck.slug == spec.slug)).first()
    desired = {
        "owner_id": None,
        "title": spec.title,
        "description": spec.description,
        "is_builtin": True,
        "subject": spec.subject,
        "difficulty": spec.difficulty,
        "visibility": "public",
        "tags": list(spec.tags),
    }

    if deck is None:
        deck = Deck(slug=spec.slug, **desired)
        session.add(deck)
        session.flush()
        deck.published_at = deck.created_at
        session.add(deck)
        session.flush()
        return deck

    changed = False
    for field, value in desired.items():
        if getattr(deck, field) != value:
            setattr(deck, field, value)
            changed = True
    if deck.published_at is None:
        deck.published_at = deck.created_at
        changed = True
    if changed:
        deck.updated_at = utc_now()
        session.add(deck)
        session.flush()
    return deck


def seed_curriculum(session: Session, spec: CurriculumSpec) -> dict[str, int | str]:
    """Insert or repair one Official curriculum without touching other decks."""
    rows = _curriculum_rows(spec)
    deck = _official_deck(session, spec)
    deck_id = int(deck.id or 0)

    existing_cards = {
        card.word: card
        for card in session.exec(select(Card).where(Card.deck_id == deck_id)).all()
    }
    existing_progress_ids = set(
        session.exec(
            select(UserCard.card_id).where(UserCard.user_id == DEMO_USER_ID)
        ).all()
    )

    inserted_cards = 0
    existing_count = 0
    updated_cards = 0
    created_progress = 0
    concept_cards = 0
    lab_cards = 0

    for prompt, answer, domain, kind in rows:
        if kind == "lab":
            lab_cards += 1
        else:
            concept_cards += 1

        card = existing_cards.get(prompt)
        if card is None:
            card = Card(
                deck_id=deck_id,
                word=prompt,
                definition=answer,
                topic=spec.title,
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
                "definition": answer,
                "topic": spec.title,
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
        "slug": spec.slug,
        "deck_id": deck_id,
        "deck_size": len(rows),
        "concept_cards": concept_cards,
        "lab_cards": lab_cards,
        "inserted_cards": inserted_cards,
        "existing_cards": existing_count,
        "updated_cards": updated_cards,
        "created_progress": created_progress,
    }


def seed_platform_deck(session: Session) -> dict[str, int | str]:
    """Backwards-compatible helper for the Platform Engineering seed tests."""
    return seed_curriculum(session, PLATFORM_ENGINEERING_SPEC)


def seed_all_curricula(session: Session) -> list[dict[str, int | str]]:
    """Seed every registered Official curriculum."""
    return [seed_curriculum(session, spec) for spec in OFFICIAL_CURRICULA]


def _ensure_membership(
    session: Session,
    *,
    room_id: int,
    user_id: int,
    role: str,
) -> RoomMember:
    member = session.exec(
        select(RoomMember).where(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id,
        )
    ).first()
    if member is None:
        member = RoomMember(
            room_id=room_id,
            user_id=user_id,
            role=role,
            status="active",
        )
    else:
        member.role = role
        member.status = "active"
        member.removed_at = None
        member.last_seen_at = utc_now()
    session.add(member)
    return member


def seed_demo_room(session: Session) -> dict[str, int | str]:
    """Create a stable, sandboxed account and private room for product demos."""
    deck = session.exec(select(Deck).where(Deck.slug == "platform-engineering")).first()
    if deck is None or deck.id is None:
        raise RuntimeError(
            "Platform Engineering deck must be seeded before the demo room"
        )

    guide = session.exec(select(User).where(User.email == DEMO_GUIDE_EMAIL)).first()
    if guide is None:
        guide = User(
            email=DEMO_GUIDE_EMAIL,
            display_name=DEMO_GUIDE_NAME,
            password_hash="disabled",
            is_verified=True,
        )
    else:
        guide.display_name = DEMO_GUIDE_NAME
        guide.password_hash = "disabled"
        guide.is_verified = True
    session.add(guide)
    session.flush()

    demo = session.exec(select(User).where(User.email == DEMO_LOGIN_EMAIL)).first()
    if demo is None:
        demo = User(
            email=DEMO_LOGIN_EMAIL,
            display_name=DEMO_DISPLAY_NAME,
            password_hash=hash_password(DEMO_LOGIN_PASSWORD),
            is_verified=True,
        )
    else:
        demo.display_name = DEMO_DISPLAY_NAME
        demo.is_verified = True
        if not verify_password(DEMO_LOGIN_PASSWORD, demo.password_hash):
            demo.password_hash = hash_password(DEMO_LOGIN_PASSWORD)
    session.add(demo)
    session.flush()

    guide_id = int(guide.id or 0)
    demo_id = int(demo.id or 0)
    room = session.exec(
        select(StudyRoom).where(
            StudyRoom.name == DEMO_ROOM_NAME,
            StudyRoom.host_user_id == guide_id,
        )
    ).first()
    if room is None:
        room = StudyRoom(
            host_user_id=guide_id,
            deck_id=int(deck.id),
            name=DEMO_ROOM_NAME,
            visibility="private",
            status="open",
        )
        session.add(room)
        session.flush()
    else:
        room.deck_id = int(deck.id)
        room.visibility = "private"
        room.status = "open"
        room.closed_at = None
        room.updated_at = utc_now()
        session.add(room)
        session.flush()

    room_id = int(room.id or 0)
    _ensure_membership(session, room_id=room_id, user_id=guide_id, role="host")
    _ensure_membership(session, room_id=room_id, user_id=demo_id, role="member")

    starter_messages = (
        "👋 Welcome to the FlashQuest Demo Room. This is a safe sandbox for trying realtime chat and room features.",
        "🎮 Quest Rooms can run the same Blitz, Match Quest, and Sort the Stack activities used in solo Arcade.",
        "💬 Send a message below to test realtime chat. The public demo account cannot create decks or new rooms.",
    )
    existing_bodies = set(
        session.exec(
            select(RoomMessage.body).where(RoomMessage.room_id == room_id)
        ).all()
    )
    created_messages = 0
    for body in starter_messages:
        if body in existing_bodies:
            continue
        session.add(
            RoomMessage(
                room_id=room_id,
                user_id=guide_id,
                kind="system",
                body=body,
            )
        )
        created_messages += 1

    session.commit()
    return {
        "room_id": room_id,
        "demo_user_id": demo_id,
        "guide_user_id": guide_id,
        "created_messages": created_messages,
    }


def run() -> None:
    """Seed the configured database and print one compact summary per deck."""
    with Session(engine) as session:
        results = seed_all_curricula(session)
        demo_result = seed_demo_room(session)

    total_cards = sum(int(result["deck_size"]) for result in results)
    print(
        f"FlashQuest Official Library ready: {len(results)} decks, "
        f"{total_cards} registered cards."
    )
    for result in results:
        print(
            f"- {result['slug']}: {result['deck_size']} cards "
            f"({result['inserted_cards']} inserted, "
            f"{result['updated_cards']} repaired, "
            f"{result['existing_cards']} already present)."
        )
    print(f"- demo-room: room #{demo_result['room_id']} ready for {DEMO_LOGIN_EMAIL}.")


if __name__ == "__main__":
    run()
