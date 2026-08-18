"""Library metadata and deck-visibility foundation tests."""

from sqlmodel import Session

from app.models import Card, Deck, User
from app.security import create_auth_session, hash_password


def _verified_headers(session: Session, email: str = "creator@example.com") -> dict[str, str]:
    user = User(
        email=email,
        display_name="Deck Creator",
        password_hash=hash_password("strong-pass-123"),
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_auth_session(session, int(user.id or 0))
    return {"Authorization": f"Bearer {token}"}


def _community_deck_with_card(session: Session, visibility: str) -> Deck:
    owner = User(
        email=f"{visibility}-owner@example.com",
        display_name=f"{visibility.title()} Creator",
        password_hash=hash_password("strong-pass-123"),
        is_verified=True,
    )
    session.add(owner)
    session.commit()
    session.refresh(owner)

    deck = Deck(
        owner_id=owner.id,
        title=f"{visibility.title()} Community Deck",
        slug=f"{visibility}-community-deck",
        description="Visibility boundary test",
        is_builtin=False,
        subject="Testing",
        difficulty="beginner",
        visibility=visibility,
        tags=["visibility"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    session.add(
        Card(
            deck_id=deck.id,
            word=f"{visibility} prompt",
            definition=f"{visibility} answer",
            topic=deck.title,
            domain="Testing",
            kind="concept",
            is_builtin=False,
        )
    )
    session.commit()
    return deck


def test_created_deck_is_private_and_normalizes_library_metadata(client, sqlite_session: Session):
    headers = _verified_headers(sqlite_session)

    response = client.post(
        "/decks",
        headers=headers,
        json={
            "title": "Accounting Basics",
            "description": "A starter accounting deck",
            "subject": "  Accounting   ",
            "difficulty": "BEGINNER",
            "tags": [" CPA ", "accounting", "CPA", "  fundamentals  "],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["visibility"] == "private"
    assert payload["subject"] == "Accounting"
    assert payload["difficulty"] == "beginner"
    assert payload["tags"] == ["cpa", "accounting", "fundamentals"]
    assert payload["is_builtin"] is False
    assert payload["is_official"] is False
    assert payload["creator_display_name"] == "Deck Creator"
    assert payload["published_at"] is None
    assert payload["source_deck_id"] is None


def test_invalid_difficulty_is_rejected(client, sqlite_session: Session):
    headers = _verified_headers(sqlite_session)
    response = client.post(
        "/decks",
        headers=headers,
        json={"title": "Odd Deck", "difficulty": "legendary"},
    )
    assert response.status_code == 422


def test_featured_deck_is_exposed_as_official(client, sqlite_session: Session):
    deck = Deck(
        owner_id=None,
        title="Linux Fundamentals",
        slug="linux-fundamentals",
        description="Official test deck",
        is_builtin=True,
        subject="Technology",
        difficulty="beginner",
        visibility="public",
        tags=["linux"],
    )
    sqlite_session.add(deck)
    sqlite_session.commit()
    sqlite_session.refresh(deck)

    response = client.get("/decks/featured")
    assert response.status_code == 200
    payload = response.json()[0]
    assert payload["id"] == deck.id
    assert payload["is_official"] is True
    assert payload["visibility"] == "public"
    assert payload["creator_display_name"] is None


def test_copy_of_official_deck_stays_private_and_tracks_source(client, sqlite_session: Session):
    source = Deck(
        owner_id=None,
        title="Docker Fundamentals",
        slug="docker-fundamentals",
        description="Official Docker deck",
        is_builtin=True,
        subject="Technology",
        difficulty="beginner",
        visibility="public",
        tags=["docker", "containers"],
    )
    sqlite_session.add(source)
    sqlite_session.commit()
    sqlite_session.refresh(source)
    sqlite_session.add(
        Card(
            deck_id=source.id,
            word="What is an image?",
            definition="An immutable filesystem template used to create containers.",
            topic=source.title,
            domain="Docker",
            kind="concept",
            is_builtin=True,
        )
    )
    sqlite_session.commit()

    headers = _verified_headers(sqlite_session, "remixer@example.com")
    response = client.post(f"/decks/{source.id}/copy", headers=headers)

    assert response.status_code == 201
    payload = response.json()
    assert payload["visibility"] == "private"
    assert payload["source_deck_id"] == source.id
    assert payload["subject"] == "Technology"
    assert payload["difficulty"] == "beginner"
    assert payload["tags"] == ["docker", "containers"]
    assert payload["is_official"] is False


def test_anonymous_user_can_study_public_community_deck(client, sqlite_session: Session):
    deck = _community_deck_with_card(sqlite_session, "public")
    response = client.get(
        "/study/next",
        params={"deck_id": deck.id},
        headers={"X-Demo-Session": "public-browser-session"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_anonymous_user_can_study_unlisted_deck_by_direct_id(client, sqlite_session: Session):
    deck = _community_deck_with_card(sqlite_session, "unlisted")
    response = client.get(
        "/study/next",
        params={"deck_id": deck.id},
        headers={"X-Demo-Session": "unlisted-browser-session"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_anonymous_user_cannot_study_private_community_deck(client, sqlite_session: Session):
    deck = _community_deck_with_card(sqlite_session, "private")
    response = client.get("/study/next", params={"deck_id": deck.id})
    assert response.status_code == 401
