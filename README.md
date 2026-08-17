# FlashQuest 🎮🧠

**A game-like spaced-repetition learning app built as a production-minded full-stack platform project.**

[![CI](https://github.com/mergemaven11/flashcards/actions/workflows/ci.yml/badge.svg)](https://github.com/mergemaven11/flashcards/actions/workflows/ci.yml)
[![Docs Deploy](https://github.com/mergemaven11/flashcards/actions/workflows/docs-deploy.yml/badge.svg)](https://github.com/mergemaven11/flashcards/actions/workflows/docs-deploy.yml)
[![Docs](https://img.shields.io/badge/docs-live-brightgreen)](https://flashcards-docs.netlify.app/)

FlashQuest turns flashcard study into a lightweight memory game while keeping durable learning state in a FastAPI/PostgreSQL backend. The repository also demonstrates the operational concerns expected in platform engineering: dependency-aware health checks, migrations, request correlation, container hardening, environment-driven configuration, and multi-layer CI quality gates.

## What it feels like

The frontend is designed as a **memory quest**, not a generic CRUD dashboard:

- ⚡ session XP and player levels
- 🔥 correct-answer combos and best-streak tracking
- 🎯 session accuracy feedback
- ⭐ real card mastery derived from the backend spaced-repetition bin
- ✨ animated answer/reward feedback
- 🗺️ a 12-level mastery map
- 🏆 checkpoint and deck-completion states
- ⌨️ keyboard controls: `Space` reveal, `1` missed, `2` nailed it
- 🧪 a Deck Lab for card administration
- 🗺️ a Deck Map that combines learning progress with runtime status

Game XP/combo values are intentionally **session-local presentation state**. Durable mastery always comes from the API, so visual rewards never replace the real learning model.

---

## Platform Engineering signals

| Area | Implementation |
| --- | --- |
| **Service health** | Separate liveness and database-backed readiness endpoints |
| **Observability** | `X-Request-ID` propagation/generation and response timing headers |
| **Configuration** | Environment-driven DB, CORS, environment, version, and frontend API settings |
| **Database lifecycle** | Alembic migrations; app startup does not silently mutate schema |
| **Containers** | Docker Compose for web/API/Postgres; API runs as a non-root user |
| **Dependency ordering** | Web waits for API readiness; API waits for PostgreSQL health |
| **CI/CD** | Backend matrix, frontend lint/build, PostgreSQL migration smoke test, container builds |
| **Docs** | MkDocs + architecture/operations documentation |
| **Product boundaries** | Durable domain state is separate from ephemeral UI gamification state |

See [`docs/PLATFORM_ENGINEERING.md`](docs/PLATFORM_ENGINEERING.md) for the design rationale and failure boundaries.

---

## Architecture

```text
┌──────────────────────┐
│ React + TypeScript   │
│ FlashQuest frontend  │
└──────────┬───────────┘
           │ HTTP / JSON
           ▼
┌──────────────────────┐
│ FastAPI              │
│ study + card API     │
└──────────┬───────────┘
           │ SQLModel / SQLAlchemy
           ▼
┌──────────────────────┐
│ PostgreSQL 16        │
│ cards + reviews      │
└──────────────────────┘
           ▲
           │ schema lifecycle
┌──────────┴───────────┐
│ Alembic migrations   │
└──────────────────────┘
```

### Core stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Axios, React Router
- **Backend:** FastAPI, SQLModel/SQLAlchemy, Pydantic Settings, Uvicorn
- **Database:** PostgreSQL 16
- **Schema:** Alembic
- **Containers:** Docker + Docker Compose
- **Docs:** MkDocs Material + mkdocstrings + TypeDoc
- **CI:** GitHub Actions

---

## Spaced repetition engine

Cards move through **12 mastery bins (`0`–`11`)**. Higher bins have longer delays before the card becomes due again.

| Bin | Approx. delay |
| --- | --- |
| 0 | new |
| 1 | 5s |
| 2 | 30s |
| 3 | 5m |
| 4 | 30m |
| 5 | 2h |
| 6 | 6h |
| 7 | 1d |
| 8 | 2d |
| 9 | 4d |
| 10 | 7d |
| 11 | terminal mastery |

Rules:

- correct → advance one bin
- wrong → return to bin 1 and increment lifetime wrong count
- repeated misses can mark a card `hard_to_remember`
- reaching the terminal state removes the card from the active study queue
- selection prioritizes due cards, then new cards
- every answer creates a `Review` record for future analytics

---

## Run locally with Docker

Requires Docker Desktop / Docker Compose v2.

```bash
git clone https://github.com/mergemaven11/flashcards.git
cd flashcards
docker compose up --build
```

Then open:

- **FlashQuest:** `http://localhost:5173`
- **FastAPI docs:** `http://localhost:8080/docs`
- **PostgreSQL host port:** `5433`

Seed example cards:

```bash
docker compose exec api python -m app.seed
```

Stop services:

```bash
docker compose down
```

Remove the development database volume too:

```bash
docker compose down -v
```

---

## Health and readiness

FlashQuest distinguishes a live process from a service that is ready to receive traffic.

```text
GET /health
GET /health/live
GET /health/ready
```

- `/health` — backwards-compatible lightweight health response
- `/health/live` — process/service metadata check
- `/health/ready` — executes a database query and returns `503` if PostgreSQL is unavailable

Every API response also includes:

```text
X-Request-ID
X-Response-Time-Ms
```

If a caller supplies `X-Request-ID`, the API propagates it. Otherwise one is generated.

---

## Environment configuration

### Backend

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | local Postgres |
| `APP_ENV` | environment label | `development` |
| `APP_VERSION` | API/service version | `1.0.0` |
| `LOG_LEVEL` | application log level | `INFO` |
| `ALLOWED_ORIGINS` | JSON array or comma-separated CORS origins | local + deployed frontend defaults |

### Frontend

```env
VITE_API_URL=http://localhost:8080
```

The frontend API endpoint is a build-time Vite setting.

---

## Database migrations

Create a migration after a model change:

```bash
docker compose exec api alembic -c /app/alembic.ini revision --autogenerate -m "describe change"
```

Apply migrations:

```bash
docker compose exec api alembic -c /app/alembic.ini upgrade head
```

Inspect migration state:

```bash
docker compose exec api alembic -c /app/alembic.ini current
```

CI also provisions a clean PostgreSQL 16 service and runs `alembic upgrade head` as a migration smoke test.

---

## API quick reference

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | compatibility health check |
| `GET /health/live` | liveness + service metadata |
| `GET /health/ready` | database-backed readiness |
| `POST /cards` | create a flashcard |
| `GET /cards` | list cards |
| `GET /cards/admin` | cards with study state |
| `GET /study/next` | retrieve the next due/new study item |
| `POST /study/answer` | submit correct/wrong answer and update mastery |

Interactive OpenAPI documentation is available at `/docs`.

---

## CI quality gates

Pull requests are validated without CI rewriting or pushing source code.

The pipeline checks:

1. **Backend** on Python 3.11 and 3.12
   - bytecode compilation
   - pytest
   - Ruff
   - Black formatting check
2. **Frontend**
   - clean `npm ci`
   - ESLint
   - TypeScript + production Vite build
3. **PostgreSQL migrations**
   - clean PostgreSQL 16 instance
   - Alembic upgrade to `head`
4. **Containers**
   - `docker compose config`
   - API image build
   - web image build

Documentation deployment remains a separate workflow.

---

## Development without Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Quality checks:

```bash
# backend
python -m pytest -q
ruff check . --exclude alembic/versions
black --check . --extend-exclude 'alembic/versions'

# frontend
npm run lint
npm run build
```

---

## Repository layout

```text
.
├── .github/workflows/       CI + docs deployment
├── backend/
│   ├── alembic/             schema migrations
│   ├── app/                 FastAPI domain/API code
│   ├── tests/               backend + operational tests
│   └── Dockerfile
├── frontend/
│   ├── src/pages/           Study, Deck Lab, Deck Map
│   ├── src/api.ts           typed API client
│   └── Dockerfile
├── docs/                    product + architecture docs
├── docker-compose.yml
└── mkdocs.yml
```

---

## Portfolio talking points

FlashQuest is useful beyond demonstrating React/FastAPI CRUD. It gives concrete examples to discuss in a Platform Engineer interview:

- why liveness and readiness should be different checks;
- how service dependencies affect startup and orchestration;
- how to validate DB migrations before deployment;
- why CI should validate contributor code rather than silently rewrite it;
- how request correlation helps debugging across proxies/services;
- why containers should run with least privilege;
- how build-time and runtime configuration differ;
- how product-facing game state can remain ephemeral while domain state stays durable and auditable.

---

**FlashQuest — level up what you remember.** ⚡
