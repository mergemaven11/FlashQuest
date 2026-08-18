"""Admin endpoint tests: reusable custom cards plus protected demo content."""

from sqlmodel import Session

from app.config import settings
from app.models import Card, UserCard


def test_admin_create_list_update_delete(client, sqlite_session: Session):
    """Custom cards can be created, customized, listed, and deleted."""
    r = client.post(
        "/cards",
        json={
            "word": "What is a VPC?",
            "definition": "A logically isolated virtual network.",
            "topic": "AWS",
            "domain": "Networking",
            "kind": "concept",
        },
    )
    assert r.status_code == 200
    card = r.json()
    cid = card["id"]
    assert card["topic"] == "AWS"
    assert card["is_builtin"] is False

    items = client.get("/cards/admin").json()
    assert any(
        x["id"] == cid
        and x["topic"] == "AWS"
        and x["domain"] == "Networking"
        and "bin" in x
        for x in items
    )

    r = client.patch(
        f"/cards/{cid}",
        json={"topic": "AWS SAA", "kind": "lab", "definition": "Updated answer"},
    )
    assert r.status_code == 200
    assert r.json()["topic"] == "AWS SAA"
    assert r.json()["kind"] == "lab"

    r = client.delete(f"/cards/{cid}")
    assert r.status_code == 200 and r.json()["ok"] is True
    assert client.get("/cards").json() == []


def test_built_in_card_requires_demo_password_to_delete(
    client, sqlite_session: Session, monkeypatch
):
    """Seeded/demo content cannot be wiped by an anonymous visitor."""
    card = Card(
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
    sqlite_session.add(UserCard(card_id=card.id, user_id=1))
    sqlite_session.commit()

    assert client.delete(f"/cards/{card.id}").status_code == 503

    monkeypatch.setattr(settings, "DEMO_DELETE_PASSWORD", "demo-secret")
    assert (
        client.delete(
            f"/cards/{card.id}",
            headers={"X-Demo-Admin-Password": "wrong"},
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"/cards/{card.id}",
            headers={"X-Demo-Admin-Password": "demo-secret"},
        ).status_code
        == 200
    )


def test_built_in_card_is_read_only(client, sqlite_session: Session):
    card = Card(
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

    response = client.patch(f"/cards/{card.id}", json={"definition": "defaced"})
    assert response.status_code == 403


def test_admin_search_and_stats(client, sqlite_session: Session):
    """Search includes metadata; stats still expose every spaced-repetition bin."""
    client.post(
        "/cards",
        json={
            "word": "eager",
            "definition": "keen",
            "topic": "English",
            "domain": "Vocabulary",
        },
    )
    client.post(
        "/cards",
        json={
            "word": "earnest",
            "definition": "serious",
            "topic": "English",
            "domain": "Vocabulary",
        },
    )

    items = client.get("/cards/admin", params={"q": "ear"}).json()
    words = {x["word"] for x in items}
    assert "earnest" in words and "eager" not in words

    topic_items = client.get("/cards/admin", params={"q": "English"}).json()
    assert len(topic_items) == 2

    stats = client.get("/cards/stats").json()
    assert {"total_cards", "active", "never", "hard_to_remember", "by_bin"} <= set(
        stats.keys()
    )
    assert set(map(int, stats["by_bin"].keys())) == set(range(12))
