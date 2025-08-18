# Hiring Flashcards

A minimal, production-minded **spaced repetition** web app for vocabulary study.  
Built with **React (Vite)** + **FastAPI** + **PostgreSQL**, packaged via **Docker Compose**, and documented with **MkDocs** + **TypeDoc** + **mkdocstrings**.

---

## 📚 What this app does

- Create **flashcards** (word + definition)
- Study loop: show **word** → *reveal definition* → mark **I got it** / **I did not**
- Cards move through **12 mastery bins (0–11)**; higher bins wait longer between reviews
- If a card is answered **wrong** 10 times (lifetime), it becomes **hard_to_remember** and is hidden
- If all cards are **never** or **hard_to_remember**, the user is **permanently done**

**Bin delays**

| Bin | Delay        |
|-----|--------------|
| 0   | new (none)   |
| 1   | 5s           |
| 2   | 25s          |
| 3   | 2m           |
| 4   | 10m          |
| 5   | 1h           |
| 6   | 5h           |
| 7   | 1d           |
| 8   | 5d           |
| 9   | 25d          |
| 10  | ~4mo         |
| 11  | never        |

**Rules (short):**  
Correct → next bin (max 11).  
Wrong → bin 1 + `wrong_count++`.  
`wrong_count >= 10` → `hard_to_remember`.

---

## 🧭 Docs map (start here)

- **Backend API (FastAPI, Python docstrings)** → [Backend / API](backend/api.md)  
  Study & admin endpoints, datamodels, selection logic.

- **Frontend Reference (React, JSDoc → Markdown)** → [Frontend / Reference](frontend/modules.md)  
  Components, types, and API client helpers.

> This site is generated from **comments in code**: Python docstrings via `mkdocstrings`, and TypeScript JSDoc via `typedoc-plugin-markdown`.

---

## 🏗️ Architecture (overview)

┌───────────┐ HTTP/JSON ┌───────────────┐ SQL ┌──────────────┐
│ React │ <────────────────────> │ FastAPI │ <──────────────> │ Postgres │
│ (SPA) │ /study/* /cards/* │ (Uvicorn) │ SQLModel ORM │ (state) │
└───────────┘ └───────────────┘ └──────────────┘
▲
│ Static assets
└──────── Nginx (Docker)


- **Frontend**: Vite (TypeScript), simple SPA with routes for `/study` and `/admin`
- **Backend**: FastAPI + SQLModel (SQLAlchemy), Alembic migrations, documented with Google-style docstrings
- **DB**: PostgreSQL (local via Docker; deploy-ready for Neon/Fly.io)
- **Containers**: separate images for `web` (Nginx+SPA) and `api` (Uvicorn+FastAPI)

---

## 🎯 Study selection (spec-driven)

1. If there are **due** active cards (`next_review_at <= now`), show them first:
   - higher **bin** first → earlier **due time** → lowest **card id**
2. If no due cards, draw **new** cards from **bin 0**
3. If there are no new cards and nothing due:
   - show: **“You are temporarily done; please come back later to review more words.”**
4. If all cards are either **bin 11 (never)** or **hard_to_remember**:
   - show: **“You have no more words to review; you are permanently done!”**

**Tiny example**

```text
New card starts in bin 0 → drawn when nothing is due.
You answer correct → moves to bin 1, next_review_at = now + 5s.
After 5s, it’s due. If you answer wrong → bin 1 again, wrong_count++.
Keep getting it right → climbs bins; reaching bin 11 sets status never.
If wrong_count = 10 at any point → hard_to_remember (hidden forever).
```

## 🚀 Quickstart (local with Docker)

# Build & run stack
docker compose up --build

**URLs**
 API docs: http://localhost:8080/docs
 Web app:  http://localhost:5173

(Optional) Seed a few cards
docker compose exec api python -m app.seed

## Migrations (Alembic)

**Generate migration from models** 

docker compose exec api alembic -c /app/alembic.ini revision --autogenerate -m "desc"

**Apply latest** 

docker compose exec api alembic -c /app/alembic.ini upgrade head

**Show current**

docker compose exec api alembic -c /app/alembic.ini current
