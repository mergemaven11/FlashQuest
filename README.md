# Hiring Flashcards

MVP web app implementing **spaced repetition** for vocabulary study.
**React (Vite) SPA** + **FastAPI** API + **PostgreSQL**, packaged with **Docker Compose** for easy run.

> **Repo name:** `hiring-[firstname]-[lastname]-flashcards` (private)

[![Docs](https://img.shields.io/badge/docs-live-brightgreen)](https://flashcards-docs.netlify.app/)
[Docs](https://flashcards-docs.netlify.app/ "Open the documentation")


---
![CI](https://github.com/mergemaven11/hiring-tobias-scott-flashcards/actions/workflows/ci.yml/badge.svg)
[![Docs Deploy](https://github.com/mergemaven11/hiring-tobias-scott-flashcards/actions/workflows/docs-deploy.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/docs-deploy.yml)


## Overview

- Create flashcards (word + definition)
- Study loop: show word → reveal definition → “I got it” / “I didn’t”
- Cards progress through **12 bins (0–11)**; delays increase per bin
- Lifetime wrong ≥ 10 ⇒ **hard_to_remember** (never shown again)
- If all cards are “never” or “hard_to_remember” ⇒ permanently done

### Spaced Repetition Bins

| Bin | Delay (approx) |
|-----|-----------------|
| 0   | new (no delay)  |
| 1   | 5s              |
| 2   | 25s             |
| 3   | 2m              |
| 4   | 10m             |
| 5   | 1h              |
| 6   | 5h              |
| 7   | 1d              |
| 8   | 5d              |
| 9   | 25d             |
| 10  | ~4mo            |
| 11  | never           |

**Rules:**

- Correct ⇒ `bin = min(bin+1, 11)`
- Wrong ⇒ `bin = 1` and `wrong_count += 1`
- `wrong_count >= 10` ⇒ status = `hard_to_remember`
- Selection order: due cards (highest bin first) → new cards (bin 0) → status messages

---

## Tech Stack

- **Frontend:** React (Vite, TypeScript), Axios, React Router, served by Nginx
- **Backend:** FastAPI, SQLModel/SQLAlchemy, Pydantic Settings, Uvicorn
- **DB:** PostgreSQL
- **Containers:** Dockerfiles for web & api + `docker-compose.yml`
- **Docs:** Google-style docstrings throughout backend

> If frameworks/templates or AI assistance were used: this project was built with React + FastAPI, and an AI assistant was used to accelerate scaffolding and documentation.

---

## Project Structure

```
.
├─ docker-compose.yml
├─ backend/
│  ├─ Dockerfile
│  ├─ requirements.txt
│  ├─ .dockerignore
│  ├─ .env.example
│  └─ app/
│     ├─ main.py
│     ├─ config.py
│     ├─ db.py
│     ├─ models.py
│     ├─ crud.py
│     ├─ routers/
│     │  ├─ cards.py
│     │  └─ study.py
│     └─ seed.py
└─ frontend/
   ├─ Dockerfile
   ├─ .dockerignore
   ├─ nginx.conf
   ├─ .env.example
   └─ src/...
```

---

## Run Locally (Docker)

> Requires Docker Desktop (Compose v2).
> The API URL is baked into the SPA at build time via a build arg.

### Database Migrations (Alembic)
Inside Docker:
```bash
docker compose exec api alembic -c /app/alembic.ini revision --autogenerate -m "desc"
docker compose exec api alembic -c /app/alembic.ini upgrade head
docker compose exec api alembic -c /app/alembic.ini current
```

### 6) Tips for future model changes
- Make your model change (add nullable column first, if possible).
- Generate + apply:
  ```bat
  docker compose exec api alembic -c /app/alembic.ini revision --autogenerate -m "add <field>"
  docker compose exec api alembic -c /app/alembic.ini upgrade head
---

1. **Start everything**
   ```bash
   docker compose up --build
   ```
   - API docs: http://localhost:8080/docs
   - Web app:  http://localhost:5173

2. **Seed a few cards (one-off)**
   ```bash
   docker compose exec api python -m app.seed
   ```

3. **Stop/clean**
   ```bash
   docker compose down
   # or remove volumes too:
   docker compose down -v
   ```

> If you already have Postgres on host port 5432, change the compose mapping to `5433:5432` under the `db` service.

---

## Environment Variables

### Frontend (`frontend/.env.example`)
```env
# In prod builds (Netlify), set to your deployed API URL (Fly.io, etc.)
VITE_API_URL=http://localhost:8080
```

The Docker build passes this in as a **build arg**:
```yaml
web:
  build:
    context: ./frontend
    args:
      VITE_API_URL: "http://localhost:8080"
```

### Backend (`backend/.env.example`)
```env
# For local (non-Docker) dev:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flashcards
# In Docker, compose sets:
# postgresql://postgres:postgres@db:5432/flashcards
```

> `.env` files should **not** be committed. Examples are included for clarity.

---

## API Quick Reference

Base URL: `http://localhost:8080`

- `GET /health` → `{ "ok": true }`
- `POST /cards` → create a card (also creates `UserCard` at bin 0)
  ```json
  { "word": "abate", "definition": "to become less intense or widespread" }
  ```
- `GET /cards` → list cards (basic)
- `GET /cards/admin` → list cards with status
  Returns: `{ id, word, definition, bin, wrong_count, next_review_at, status }[]`
- `GET /study/next` →
  - `{ "status": "ok", "card": { ... } }` or
  - `{ "status": "temporarily_done" }` or `{ "status": "permanently_done" }`
- `POST /study/answer?card_id=ID&result=correct|wrong` → updates bins/timers
  Returns: `{ "ok": true, "to_bin": number, "status": "active|never|hard_to_remember" }`

OpenAPI docs at **/docs**.

---

## Admin UI

Navigate to **`/admin`** in the SPA:

- Create new cards
- View all cards with **bin**, **next review**, **wrong count**, and **status**

---

## Development (without Docker) — optional

**Backend**
```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

**Frontend**
```bash
cd frontend
cp .env.example .env   # set VITE_API_URL if needed
npm ci
npm run dev
```

---

## Deployment Plan (suggested)

- **DB:** Neon (Postgres, serverless)
- **API:** Fly.io (Docker image; set `DATABASE_URL` as a secret)
- **Web:** Netlify (build with `VITE_API_URL` → Fly.io API URL)

> Uptime can be monitored with UptimeRobot hitting `/health`. Requirement: live for 3+ weeks.

---

## Testing & Next Steps (time permitting)

- **Unit tests** for:
  - Bin transitions and timers
  - Selection ordering (due → new → messages)
- **CI (GitHub Actions)**:
  - `api`: lint + tests
  - `web`: typecheck + build
- **Polish**:
  - CSV import in Admin
  - Keyboard shortcuts (space to reveal; `1`/`2` for wrong/right)
  - Minor styling pass
- **Extend** to multiple users (schema already includes `user_id`)

---

## Notes for Reviewers

- Built as a **single-page app** with a **relational DB** to mirror your stack preference.
- Backend and frontend are documented with **Google-style docstrings / JSDoc**.
- Private repo as requested; happy to provide a mid-point check-in if desired.

---

**Tiny example**

1) New card starts in **bin 0** → drawn when nothing is due.
2) You answer **correct** → moves to **bin 1**, `next_review_at = now + 5s`.
3) After 5s, it’s **due**. If you answer **wrong** → **bin 1** again, `wrong_count++`.
4) Keep getting it right → climbs bins; reaching **bin 11** sets status **never**.
5) If `wrong_count = 10` at any point → status **hard_to_remember** (hidden forever).

---

## License

Assessment purposes only (private repo).
