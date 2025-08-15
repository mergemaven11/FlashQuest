"""Admin endpoint tests: create/list/search/update/delete and stats."""

from sqlmodel import Session


def test_admin_create_list_update_delete(client, sqlite_session: Session):
    """Full CRUD lifecycle via /cards endpoints."""
    # Create
    r = client.post("/cards", json={"word": "delta", "definition": "d"})
    assert r.status_code == 200
    card = r.json()
    cid = card["id"]

    # Admin list should include status fields
    r = client.get("/cards/admin")
    items = r.json()
    assert any(x["id"] == cid and "bin" in x and "status" in x for x in items)

    # Update
    r = client.put(f"/cards/{cid}", json={"definition": "delta-def"})
    assert r.status_code == 200 and r.json()["definition"] == "delta-def"

    # Delete
    r = client.delete(f"/cards/{cid}")
    assert r.status_code == 200 and r.json()["ok"] is True

    # Verify gone
    assert client.get("/cards").json() == []


def test_admin_search_and_stats(client, sqlite_session: Session):
    """Search filters by q; stats returns counts and by_bin with expected keys."""
    client.post("/cards", json={"word": "eager", "definition": "keen"})
    client.post("/cards", json={"word": "earnest", "definition": "serious"})

    # search
    r = client.get("/cards/admin", params={"q": "ear"})
    items = r.json()
    words = {x["word"] for x in items}
    assert "earnest" in words and "eager" not in words

    # stats
    r = client.get("/cards/stats")
    stats = r.json()
    assert {"total_cards", "active", "never", "hard_to_remember", "by_bin"} <= set(
        stats.keys()
    )
    assert set(map(int, stats["by_bin"].keys())) == set(range(12))
