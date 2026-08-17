# FlashQuest 🎮🧠

**A game-like Platform Engineering study and troubleshooting app built as a production-minded full-stack platform project.**

[![CI](https://github.com/mergemaven11/flashcards/actions/workflows/ci.yml/badge.svg)](https://github.com/mergemaven11/flashcards/actions/workflows/ci.yml)
[![Docs Deploy](https://github.com/mergemaven11/flashcards/actions/workflows/docs-deploy.yml/badge.svg)](https://github.com/mergemaven11/flashcards/actions/workflows/docs-deploy.yml)
[![Docs](https://img.shields.io/badge/docs-live-brightgreen)](https://flashcards-docs.netlify.app/)

FlashQuest turns Platform Engineering preparation into a memory game with **216 built-in study challenges** backed by PostgreSQL:

- **144 concept/interview cards** — understand the systems.
- **72 hands-on lab/troubleshooting cards** — diagnose, design, and fix the systems.

The app also demonstrates platform-engineering practices in its own architecture: FastAPI, PostgreSQL, Alembic migrations, React/TypeScript, Docker Compose, non-root containers, liveness/readiness checks, request correlation, CI quality gates, and reproducible seed data.

---

## 216-card Platform Engineering curriculum

The built-in curriculum spans **12 domains**. Every domain contains **12 concept cards + 6 lab scenarios = 18 challenges**, for **216 total cards**.

| Domain | Concepts | Labs | Total |
| --- | ---: | ---: | ---: |
| Linux & OS | 12 | 6 | 18 |
| Networking | 12 | 6 | 18 |
| Containers | 12 | 6 | 18 |
| Kubernetes | 12 | 6 | 18 |
| CI/CD | 12 | 6 | 18 |
| Cloud | 12 | 6 | 18 |
| IaC & Terraform | 12 | 6 | 18 |
| Observability | 12 | 6 | 18 |
| Databases | 12 | 6 | 18 |
| Security | 12 | 6 | 18 |
| SRE & Reliability | 12 | 6 | 18 |
| Incident Response | 12 | 6 | 18 |
| **Total** | **144** | **72** | **216** |

### Concept cards

Concept cards are written like interview questions instead of glossary definitions.

Examples:

- `Kubernetes · What is the difference between liveness and readiness probes?`
- `Terraform · What does drift mean?`
- `Observability · What is an error budget?`
- `SRE · What is exponential backoff with jitter?`
- `Databases · What is point-in-time recovery?`

### 🧪 Lab / break-fix cards

Lab cards start with `LAB ·` and put you in a practical Platform Engineer situation. The answer is a **diagnostic path or implementation plan**, not just a term to memorize.

Examples:

```text
LAB · Linux · A service works manually but fails after reboot.
What do you check and fix?
```

```text
LAB · Kubernetes · A Service has no traffic even though Pods are Running.
What do you check?
```

```text
LAB · CI/CD · Tests pass locally but fail in CI.
What do you compare first?
```

```text
LAB · Terraform · plan wants to recreate a critical database unexpectedly.
What do you do?
```

```text
LAB · Databases · API errors with "too many connections".
What do you inspect?
```

```text
LAB · Incident · Error rate jumps immediately after a deployment.
What is your first operational move?
```

The lab deck includes scenarios such as:

- setting up services and environments safely;
- troubleshooting systemd, memory, disk, file descriptors, and load;
- debugging DNS, TCP, TLS, proxies, MTU, and 502s;
- fixing container startup, networking, persistence, permissions, and health checks;
- debugging CrashLoopBackOff, Pending Pods, failed rollouts, probes, and Services;
- repairing CI failures, slow pipelines, leaked secrets, deployment rollback, and artifact flow;
- investigating cloud exposure, scaling, cost spikes, private networking, and workload identity;
- handling Terraform drift, imports, state locking, dangerous plans, secrets, and module design;
- diagnosing latency, noisy alerts, request tracing, SLOs, and telemetry cost;
- fixing DB connection exhaustion, slow queries, risky migrations, deadlocks, and recovery;
- responding to CVEs, leaked credentials, excessive IAM, and software supply-chain risk;
- designing retries, graceful degradation, idempotent jobs, chaos tests, and queue recovery;
- running incident command, mitigation, customer communication, timelines, and postmortems.

---

## Seed the PostgreSQL study database

Start the stack and load all **216 cards**:

```bash
docker compose up --build -d
docker compose exec api python -m app.seed
```

The seed is **idempotent**:

- the first run inserts missing cards;
- later runs do not create duplicates;
- missing default-user progress rows are repaired;
- concept and lab decks are stored as versioned JSON curriculum data;
- automated tests verify **144 concepts + 72 labs = 216 unique cards**;
- rerunning the seed must leave the database at the same 216-card curriculum.

This makes the learning content itself reproducible environment data instead of manual database setup.

---

## What the game feels like

FlashQuest is designed as a **memory quest**, not a generic CRUD dashboard:

- ⚡ session XP and player levels
- 🔥 correct-answer combos and best-streak tracking
- 🎯 session accuracy
- ⭐ mastery based on the real backend spaced-repetition bin
- ✨ animated answer/reward feedback
- 🗺️ 12-level mastery map
- 🏆 checkpoint and deck-completion states
- ⌨️ `Space` reveal, `1` missed, `2` nailed it
- 🧪 Deck Lab for card administration
- 🗺️ Deck Map for learning progress + runtime status

Game XP and combo values are intentionally session-local. Durable study state remains in PostgreSQL.

---

## Spaced repetition engine

Cards move through **12 mastery bins (`0`–`11`)**. Higher bins have longer delays before a card becomes due again.

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

- correct → advance one bin;
- wrong → return to bin 1 and increment lifetime wrong count;
- repeated misses can mark a card `hard_to_remember`;
- terminal mastery removes a card from the active study queue;
- due cards are selected before new cards;
- every answer creates a `Review` record for later analytics.

---

## Platform Engineering signals in the project itself

| Area | Implementation |
| --- | --- |
| **Service health** | separate liveness and database-backed readiness endpoints |
| **Observability** | `X-Request-ID` propagation/generation and response timing headers |
| **Configuration** | environment-driven DB, CORS, version, environment, and frontend API settings |
| **Database lifecycle** | Alembic migrations; startup does not silently mutate schema |
| **Seed lifecycle** | idempotent 216-card curriculum with regression tests |
| **Containers** | Docker Compose for React/FastAPI/Postgres; API runs non-root |
| **Dependency ordering** | API waits for PostgreSQL health; web waits for API readiness |
| **CI/CD** | backend matrix, frontend lint/build, PostgreSQL migration smoke test, image builds |
| **Product boundaries** | durable learning state separated from ephemeral UI gamification |

See [`docs/PLATFORM_ENGINEERING.md`](docs/PLATFORM_ENGINEERING.md) for architecture and operational design details.

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
└──────────▲───────────┘
           │
┌──────────┴───────────┐
│ Alembic migrations   │
└──────────────────────┘
```

### Core stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Axios, React Router
- **Backend:** FastAPI, SQLModel/SQLAlchemy, Pydantic Settings, Uvicorn
- **Database:** PostgreSQL 16
- **Schema lifecycle:** Alembic
- **Containers:** Docker + Docker Compose
- **Docs:** MkDocs Material + mkdocstrings + TypeDoc
- **CI:** GitHub Actions

---

## Run locally

```bash
git clone https://github.com/mergemaven11/flashcards.git
cd flashcards
docker compose up --build
```

Then:

- FlashQuest: `http://localhost:5173`
- FastAPI docs: `http://localhost:8080/docs`
- PostgreSQL host port: `5433`

Load the curriculum:

```bash
docker compose exec api python -m app.seed
```

Stop:

```bash
docker compose down
```

Reset the development database:

```bash
docker compose down -v
```

---

## Health and readiness

```text
GET /health
GET /health/live
GET /health/ready
```

- `/health` — compatibility health response
- `/health/live` — process/service liveness + metadata
- `/health/ready` — executes a database query and returns `503` when PostgreSQL is unavailable

Every API response also contains:

```text
X-Request-ID
X-Response-Time-Ms
```

---

## Database migrations

Create a migration:

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

CI provisions a clean PostgreSQL 16 service and upgrades it to `head` as a migration smoke test.

---

## CI quality gates

Pull requests validate:

1. **Backend — Python 3.11 / 3.12**
   - bytecode compilation
   - pytest, including curriculum size/balance/idempotency tests
   - Ruff
   - Black formatting check
2. **Frontend**
   - `npm ci`
   - ESLint
   - TypeScript + production Vite build
3. **PostgreSQL migration smoke test**
   - clean PostgreSQL 16 service
   - Alembic upgrade to `head`
4. **Containers**
   - `docker compose config`
   - API image build
   - web image build

---

## Repository layout

```text
.
├── .github/workflows/
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── data/
│   │   │   ├── platform_engineering_cards.json   # 144 concepts
│   │   │   └── platform_engineering_labs.json    # 72 break/fix labs
│   │   ├── seed.py
│   │   └── ...
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   ├── src/pages/
│   ├── src/api.ts
│   └── Dockerfile
├── docs/
├── docker-compose.yml
└── mkdocs.yml
```

---

## Portfolio / interview talking points

FlashQuest lets you practice Platform Engineering while also giving you concrete engineering decisions to discuss:

- explain liveness vs readiness;
- troubleshoot a Kubernetes Service with no endpoints;
- diagnose CI/local environment differences;
- recover from dangerous Terraform plans and drift;
- design safer DB migrations and connection pools;
- reason about SLOs, error budgets, retries, and graceful degradation;
- handle secrets and short-lived cloud identity;
- distinguish mitigation from root-cause analysis during incidents;
- explain why seed operations and jobs should be idempotent;
- show how CI validates migrations, frontend, backend, and containers before merge.

**FlashQuest is both the project and the practice environment.**

---

**FlashQuest — learn it, break it, fix it, remember it.** ⚡
