"""Card/deck API tests for ownership and protected featured content."""

from sqlmodel import Session

from app.config import settings
from app.models import Card, Deck, User
from app.security import create_auth_session, hash_password


def _verified_user(session: Session, email: str = "tee@example.com") -> tuple[User, dict[str, str]]:
    user = User(
        email=email,
        display_name="Tee",
        password_hash=hash_password("strong-pass-123"),
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_auth_session(session, int(user.id or 0))
    return user, {"Authorization": f"Bearer {token}"}


def _create_deck(client, headers: dict[str, str], title: str = "AWS") -> int:
    response = client.post(
        "/decks",
        headers=headers,
        json={"title": title, "description": "Custom study deck"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def test_owned_card_create_list_update_delete(client, sqlite_session: Session):
    """Verified users can manage cards only inside their own decks."""
    _user, headers = _verified_user(sqlite_session)
    deck_id = _create_deck(client, headers)

    response = client.post(
        "/cards",
        headers=headers,
        json={
            "deck_id": deck_id,
            "word": "What is a VPC?",
            "definition": "A logically isolated virtual network.",
            "domain": "Networking",
            "kind": "concept",
        },
    )
    assert response.status_code == 201
    card = response.json()
    card_id = int(card["id"])
    assert card["topic"] == "AWS"
    assert card["deck_id"] == deck_id
    assert card["is_builtin"] is False

    items = client.get(
        "/cards/admin", headers=headers, params={"deck_id": deck_id}
    ).json()
    assert any(
        item["id"] == card_id
        and item["domain"] == "Networking"
        and item["bin"] == 0
        for item in items
    )

    response = client.patch(
        f"/cards/{card_id}",
        headers=headers,
        json={"kind": "lab", "definition": "Updated recovery path"},
    )
    assert response.status_code == 200
    assert response.json()["kind"] == "lab"
    assert response.json()["definition"] == "Updated recovery path"

    response = client.delete(f"/cards/{card_id}", headers=headers)
    assert response.status_code == 200 and response.json()["ok"] is True
    assert client.get("/cards", headers=headers, params={"deck_id": deck_id}).json() == []


def test_user_cannot_edit_another_users_card(client, sqlite_session: Session):
    """Ownership is enforced at the API boundary."""
    _owner, owner_headers = _verified_user(sqlite_session, "owner@example.com")
    deck_id = _create_deck(client, owner_headers, "Owner Deck")
    card_id = client.post(
        "/cards",
        headers=owner_headers,
        json={
            "deck_id": deck_id,
            "word": "Private question",
            "definition": "Private answer",
            "domain": "General",
            "kind": "concept",
        },
    ).json()["id"]

    _other, other_headers = _verified_user(sqlite_session, "other@example.com")
    response = client.patch(
        f"/cards/{card_id}",
        headers=other_headers,
        json={"definition": "Nope"},
    )
    assert response.status_code == 403


def test_built_in_card_requires_demo_password_to_delete(
    client, sqlite_session: Session, monkeypatch
):
    """Anonymous visitors cannot wipe the featured starter content."""
    deck = Deck(
        owner_id=None,
        title="Platform Engineering",
        slug="platform-engineering",
        description="Starter",
        is_builtin=True,
    )
    sqlite_session.add(deck)
    sqlite_session.flush()
    card = Card(
        deck_id=deck.id,
        word="Built-in question",
        definition="Built-in answer",
        topic="Platform Engineering",
        domain="Linux & OS",
        kind="concept",
        is_builtin=True,
    )
    sqlite_session.add(card)
    sqlite_session.commit()
    sqlite_session.refresh(card)

    assert client.delete(f"/cards/{card.id}").status_code == 503

    monkeypatch.setattr(settings, "DEMO_DELETE_PASSWORD", "demo-secret")
    assert client.delete(
        f"/cards/{card.id}", headers={"X-Demo-Admin-Password": "wrong"}
    ).status_code == 403
    assert client.delete(
        f"/cards/{card.id}",
        headers={"X-Demo-Admin-Password": "demo-secret"},
    ).status_code == 200


def test_built_in_card_is_read_only_for_signed_in_users(client, sqlite_session: Session):
    _user, headers = _verified_user(sqlite_session)
    deck = Deck(
        owner_id=None,
        title="Platform Engineering",
        slug="platform-engineering",
        description="Starter",
        is_builtin=True,
    )
    sqlite_session.add(deck)
    sqlite_session.flush()
    card = Card(
        deck_id=deck.id,
        word="Protected",
        definition="Keep me stable",
        topic="Platform Engineering",
        domain="Security",
        kind="concept",
        is_builtin=True,
    )
    sqlite_session.add(card)
    sqlite_session.commit()
    sqlite_session.refresh(card)

    response = client.patch(
        f"/cards/{card.id}", headers=headers, json={"definition": "defaced"}
    )
    assert response.status_code == 403


def test_search_and_stats_are_scoped_to_owned_deck(client, sqlite_session: Session):
    _user, headers = _verified_user(sqlite_session)
    deck_id = _create_deck(client, headers, "English")
    for word, definition in [("eager", "keen"), ("earnest", "serious")]:
        response = client.post(
            "/cards",
            headers=headers,
            json={
                "deck_id": deck_id,
                "word": word,
                "definition": definition,
                "domain": "Vocabulary",
                "kind": "concept",
            },
        )
        assert response.status_code == 201

    items = client.get(
        "/cards/admin",
        headers=headers,
        params={"q": "ear", "deck_id": deck_id},
    ).json()
    words = {item["word"] for item in items}
    assert "earnest" in words and "eager" not in words

    stats = client.get(
        "/cards/stats", headers=headers, params={"deck_id": deck_id}
    ).json()
    assert stats["total_cards"] == 2
    assert set(map(int, stats["by_bin"].keys())) == set(range(12))
