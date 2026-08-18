"""Public Library search, filtering, pagination, and share-link tests."""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session

from app.models import Card, Deck, User
from app.security import hash_password


def _community_user(session: Session, suffix: str) -> User:
    user = User(
        email=f"creator-{suffix}@example.com",
        display_name=f"Creator {suffix.title()}",
        password_hash=hash_password("strong-pass-123"),
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _deck(
    session: Session,
    *,
    slug: str,
    title: str,
    visibility: str = "public",
    subject: str = "Technology",
    difficulty: str = "beginner",
    is_builtin: bool = False,
    tags: list[str] | None = None,
    kind: str = "concept",
    published_offset_minutes: int = 0,
) -> Deck:
    owner = None if is_builtin else _community_user(session, slug)
    published = datetime.now(timezone.utc) + timedelta(minutes=published_offset_minutes)
    deck = Deck(
        owner_id=None if owner is None else owner.id,
        title=title,
        slug=slug,
        description=f"Description for {title}",
        is_builtin=is_builtin,
        subject=subject,
        difficulty=difficulty,
        visibility=visibility,
        tags=tags or [],
        published_at=published if visibility == "public" else None,
        updated_at=published,
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    session.add(
        Card(
            deck_id=deck.id,
            word=f"{title} prompt",
            definition=f"{title} answer",
            topic=title,
            domain=subject,
            kind=kind,
            is_builtin=is_builtin,
        )
    )
    session.commit()
    return deck


def test_library_lists_only_public_decks(client, sqlite_session: Session):
    official = _deck(
        sqlite_session,
        slug="official-linux",
        title="Linux Fundamentals",
        is_builtin=True,
        tags=["linux"],
    )
    community = _deck(
        sqlite_session,
        slug="community-accounting",
        title="Accounting Basics",
        subject="Accounting",
        tags=["ledger"],
    )
    _deck(
        sqlite_session,
        slug="unlisted-study-pack",
        title="Unlisted Study Pack",
        visibility="unlisted",
    )
    _deck(
        sqlite_session,
        slug="private-study-pack",
        title="Private Study Pack",
        visibility="private",
    )

    response = client.get("/decks/library")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert {item["id"] for item in payload["items"]} == {official.id, community.id}
    assert payload["items"][0]["is_official"] is True


def test_library_search_matches_title_subject_description_and_tags(client, sqlite_session: Session):
    docker = _deck(
        sqlite_session,
        slug="docker-foundations",
        title="Container Foundations",
        subject="Technology",
        tags=["docker", "containers"],
    )
    _deck(
        sqlite_session,
        slug="accounting-foundations",
        title="Accounting Foundations",
        subject="Accounting",
        tags=["ledger"],
    )

    by_tag = client.get("/decks/library", params={"q": "docker"}).json()
    assert by_tag["total"] == 1
    assert by_tag["items"][0]["id"] == docker.id

    by_subject = client.get("/decks/library", params={"q": "technology"}).json()
    assert by_subject["total"] == 1
    assert by_subject["items"][0]["id"] == docker.id

    by_description = client.get("/decks/library", params={"q": "Container Foundations"}).json()
    assert by_description["total"] == 1
    assert by_description["items"][0]["id"] == docker.id


def test_library_filters_source_subject_difficulty_and_kind(client, sqlite_session: Session):
    official = _deck(
        sqlite_session,
        slug="official-platform",
        title="Platform Engineering",
        is_builtin=True,
        subject="Technology",
        difficulty="intermediate",
        kind="lab",
    )
    community = _deck(
        sqlite_session,
        slug="community-linux",
        title="Linux for Beginners",
        subject="Technology",
        difficulty="beginner",
        kind="concept",
    )
    _deck(
        sqlite_session,
        slug="community-math",
        title="Algebra Basics",
        subject="Mathematics",
        difficulty="beginner",
        kind="concept",
    )

    official_result = client.get("/decks/library", params={"source": "official"}).json()
    assert [item["id"] for item in official_result["items"]] == [official.id]

    community_result = client.get("/decks/library", params={"source": "community"}).json()
    assert community.id in {item["id"] for item in community_result["items"]}
    assert all(item["is_official"] is False for item in community_result["items"])

    filtered = client.get(
        "/decks/library",
        params={
            "subject": "technology",
            "difficulty": "beginner",
            "kind": "concept",
            "source": "community",
        },
    ).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["id"] == community.id


def test_library_pagination_and_sort_are_stable(client, sqlite_session: Session):
    newest = _deck(
        sqlite_session,
        slug="newest-community",
        title="Zulu Newest",
        published_offset_minutes=3,
    )
    _deck(
        sqlite_session,
        slug="middle-community",
        title="Mike Middle",
        published_offset_minutes=2,
    )
    oldest = _deck(
        sqlite_session,
        slug="oldest-community",
        title="Alpha Oldest",
        published_offset_minutes=1,
    )

    first = client.get(
        "/decks/library",
        params={"sort": "newest", "page": 1, "page_size": 2},
    ).json()
    second = client.get(
        "/decks/library",
        params={"sort": "newest", "page": 2, "page_size": 2},
    ).json()

    assert first["total"] == 3
    assert first["page"] == 1 and first["page_size"] == 2
    assert first["items"][0]["id"] == newest.id
    assert len(first["items"]) == 2
    assert [item["id"] for item in second["items"]] == [oldest.id]


def test_shared_detail_allows_public_and_unlisted_but_hides_private(client, sqlite_session: Session):
    public = _deck(
        sqlite_session,
        slug="public-share",
        title="Public Share",
        visibility="public",
    )
    unlisted = _deck(
        sqlite_session,
        slug="unlisted-share",
        title="Unlisted Share",
        visibility="unlisted",
    )
    _deck(
        sqlite_session,
        slug="private-share",
        title="Private Share",
        visibility="private",
    )

    public_response = client.get(f"/decks/shared/{public.slug}")
    assert public_response.status_code == 200
    assert public_response.json()["id"] == public.id

    unlisted_response = client.get(f"/decks/shared/{unlisted.slug}")
    assert unlisted_response.status_code == 200
    assert unlisted_response.json()["id"] == unlisted.id

    private_response = client.get("/decks/shared/private-share")
    assert private_response.status_code == 404


def test_library_rejects_invalid_filter_values(client):
    assert client.get("/decks/library", params={"source": "mystery"}).status_code == 422
    assert client.get("/decks/library", params={"difficulty": "legendary"}).status_code == 422
    assert client.get("/decks/library", params={"kind": "video"}).status_code == 422
    assert client.get("/decks/library", params={"sort": "popular-ish"}).status_code == 422
