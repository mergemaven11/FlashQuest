"""Creator publishing, unpublishing, and remix behavior."""

from sqlmodel import Session

from app.models import Card, Deck, User
from app.security import create_auth_session, hash_password


def _user(session: Session, suffix: str) -> User:
    user = User(
        email=f"{suffix}@example.com",
        display_name=f"Creator {suffix.title()}",
        password_hash=hash_password("strong-pass-123"),
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _headers(session: Session, user: User) -> dict[str, str]:
    token = create_auth_session(session, int(user.id or 0))
    return {"Authorization": f"Bearer {token}"}


def _owned_deck(session: Session, owner: User, slug: str, *, with_card: bool = True) -> Deck:
    deck = Deck(
        owner_id=owner.id,
        title=f"Deck {slug}",
        slug=slug,
        description="Creator publishing test deck",
        is_builtin=False,
        subject="Technology",
        difficulty="beginner",
        visibility="private",
        tags=["creator", "test"],
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    if with_card:
        session.add(
            Card(
                deck_id=deck.id,
                word=f"{slug} prompt",
                definition=f"{slug} answer",
                topic=deck.title,
                domain="Testing",
                kind="concept",
                is_builtin=False,
            )
        )
        session.commit()
    return deck


def test_owner_can_publish_public_deck_into_library(client, sqlite_session: Session):
    owner = _user(sqlite_session, "public-owner")
    deck = _owned_deck(sqlite_session, owner, "public-owned-deck")

    response = client.post(
        f"/decks/{deck.id}/publish",
        headers=_headers(sqlite_session, owner),
        params={"visibility": "public"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["visibility"] == "public"
    assert payload["published_at"] is not None

    library = client.get("/decks/library", params={"q": "public-owned-deck"}).json()
    assert library["total"] == 1
    assert library["items"][0]["id"] == deck.id


def test_owner_can_publish_unlisted_without_entering_discovery(client, sqlite_session: Session):
    owner = _user(sqlite_session, "unlisted-owner")
    deck = _owned_deck(sqlite_session, owner, "unlisted-owned-deck")

    response = client.post(
        f"/decks/{deck.id}/publish",
        headers=_headers(sqlite_session, owner),
        params={"visibility": "unlisted"},
    )
    assert response.status_code == 200
    assert response.json()["visibility"] == "unlisted"

    assert client.get("/decks/library", params={"q": deck.slug}).json()["total"] == 0
    shared = client.get(f"/decks/shared/{deck.slug}")
    assert shared.status_code == 200
    assert shared.json()["id"] == deck.id


def test_unpublish_returns_deck_to_private_and_revokes_share_link(client, sqlite_session: Session):
    owner = _user(sqlite_session, "unpublish-owner")
    deck = _owned_deck(sqlite_session, owner, "unpublish-owned-deck")
    headers = _headers(sqlite_session, owner)

    assert client.post(
        f"/decks/{deck.id}/publish", headers=headers, params={"visibility": "public"}
    ).status_code == 200
    response = client.post(f"/decks/{deck.id}/unpublish", headers=headers)

    assert response.status_code == 200
    assert response.json()["visibility"] == "private"
    assert client.get(f"/decks/shared/{deck.slug}").status_code == 404
    assert client.get("/decks/library", params={"q": deck.slug}).json()["total"] == 0


def test_empty_deck_cannot_be_published(client, sqlite_session: Session):
    owner = _user(sqlite_session, "empty-owner")
    deck = _owned_deck(sqlite_session, owner, "empty-owned-deck", with_card=False)

    response = client.post(
        f"/decks/{deck.id}/publish",
        headers=_headers(sqlite_session, owner),
        params={"visibility": "public"},
    )
    assert response.status_code == 422
    assert "at least one card" in response.json()["detail"].lower()


def test_non_owner_cannot_publish_someone_elses_deck(client, sqlite_session: Session):
    owner = _user(sqlite_session, "real-owner")
    stranger = _user(sqlite_session, "stranger")
    deck = _owned_deck(sqlite_session, owner, "not-yours")

    response = client.post(
        f"/decks/{deck.id}/publish",
        headers=_headers(sqlite_session, stranger),
        params={"visibility": "public"},
    )
    assert response.status_code == 403


def test_verified_user_can_remix_public_community_deck(client, sqlite_session: Session):
    creator = _user(sqlite_session, "community-source")
    source = _owned_deck(sqlite_session, creator, "community-remix-source")
    source.visibility = "public"
    sqlite_session.add(source)
    sqlite_session.commit()

    remixer = _user(sqlite_session, "community-remixer")
    response = client.post(
        f"/decks/{source.id}/copy",
        headers=_headers(sqlite_session, remixer),
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["owner_id"] == remixer.id
    assert payload["visibility"] == "private"
    assert payload["source_deck_id"] == source.id
    assert payload["card_count"] == 1
    assert payload["title"].endswith("— Remix")


def test_private_deck_cannot_be_remixed_by_non_owner(client, sqlite_session: Session):
    creator = _user(sqlite_session, "private-source-owner")
    source = _owned_deck(sqlite_session, creator, "private-remix-source")
    remixer = _user(sqlite_session, "private-remix-stranger")

    response = client.post(
        f"/decks/{source.id}/copy",
        headers=_headers(sqlite_session, remixer),
    )
    assert response.status_code == 404
