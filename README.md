# FlashQuest 🎮🧠

**Learn it. Break it. Fix it. Remember it.**

A game-like **Platform Engineering study + troubleshooting app** built with React, FastAPI, PostgreSQL, Alembic, and Docker.

[![CI](https://github.com/mergemaven11/flashcards/actions/workflows/ci.yml/badge.svg)](https://github.com/mergemaven11/flashcards/actions/workflows/ci.yml)
[![Docs Deploy](https://github.com/mergemaven11/flashcards/actions/workflows/docs-deploy.yml/badge.svg)](https://github.com/mergemaven11/flashcards/actions/workflows/docs-deploy.yml)
[![Docs](https://img.shields.io/badge/docs-live-brightgreen)](https://flashcards-docs.netlify.app/)

FlashQuest gives you **216 built-in Platform Engineering challenges** and moves them through a spaced-repetition mastery system:

- **144 concept / interview cards** — understand the systems.
- **72 hands-on lab / break-fix cards** — diagnose, design, and fix the systems.
- **12 domains** — Linux through incident response.
- **PostgreSQL-backed progress** — study state survives browser sessions.
- **Game feedback** — XP, levels, combos, accuracy, mastery, and deck progression.

The application itself is also a Platform Engineering portfolio project: dependency-aware health checks, Alembic migrations, request correlation, non-root containers, environment-driven configuration, PostgreSQL migration testing, and CI quality gates.

---

## 🚀 Quick start

A fresh environment needs **four steps in this order**: start services, migrate the schema, seed the curriculum, then verify readiness.

```bash
git clone https://github.com/mergemaven11/flashcards.git
cd flashcards

docker compose up --build -d

docker compose exec api \
  alembic -c /app/alembic.ini upgrade head

docker compose exec api python -m app.seed
```

Open:

- **FlashQuest:** `http://localhost:5173`
- **FastAPI / OpenAPI:** `http://localhost:8080/docs`
- **API readiness:** `http://localhost:8080/health/ready`
- **PostgreSQL host port:** `5433`

Verify the stack:

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

The seed command is safe to run again whenever the built-in curriculum changes:

```bash
docker compose exec api python -m app.seed
```

It is **idempotent**: existing cards are reused, new built-in cards are added, and missing default-user progress rows are repaired without duplicating the deck.

---

# 📚 216-card Platform Engineering curriculum

Every domain contains **12 concept cards + 6 lab scenarios = 18 challenges**.

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

## Concept cards

These are written more like **Platform Engineer interview questions** than vocabulary definitions.

Examples:

```text
Kubernetes · What is the difference between liveness and readiness probes?
Terraform · What does drift mean?
Observability · What is an error budget?
SRE · What is exponential backoff with jitter?
Databases · What is point-in-time recovery?
```

## 🧪 Lab / break-fix cards

Lab prompts start with `LAB ·` and put you inside an operational situation. The answer gives you a troubleshooting path, implementation plan, or safe recovery sequence.

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
LAB · Databases · The API reports "too many connections".
What do you inspect and fix?
```

```text
LAB · Incident · Error rate jumps immediately after a deployment.
What is your first operational move?
```

The lab deck covers work such as:

- setting up services and environments safely;
- troubleshooting systemd, disk, memory, load, inodes, and file descriptors;
- debugging DNS, TCP, TLS, proxies, MTU, routing, and 502s;
- fixing container startup, networking, persistence, permissions, and health checks;
- debugging `CrashLoopBackOff`, Pending Pods, probes, failed rollouts, and Services with no endpoints;
- repairing CI failures, slow pipelines, leaked secrets, rollbacks, and artifact flow;
- investigating cloud exposure, autoscaling, cost spikes, private networking, and workload identity;
- handling Terraform drift, state locks, imports, dangerous plans, secrets, and module design;
- diagnosing latency, noisy alerts, tracing gaps, SLOs, and telemetry cost;
- fixing database connection exhaustion, slow queries, risky migrations, deadlocks, and recovery;
- responding to CVEs, leaked credentials, excessive IAM, and software supply-chain risk;
- designing retries, idempotent jobs, graceful degradation, circuit breakers, and chaos tests;
- running incidents: triage, mitigation, incident command, rollback, communications, timelines, and postmortems.

### Curriculum data

The built-in curriculum is versioned separately from application code:

```text
backend/app/data/
├── platform_engineering_cards.json   # 144 concepts
└── platform_engineering_labs.json    # 72 break/fix labs
```

Automated tests verify:

- 144 concept cards;
- 72 lab cards;
- 216 unique prompts total;
- balanced domain counts;
- rerunning the seed does not create duplicate cards or progress rows.

---

# 🎮 Study experience

FlashQuest is designed as a **memory quest**, not a plain CRUD dashboard.

- ⚡ session XP and player levels
- 🔥 correct-answer combos and best streak
- 🎯 session accuracy
- ⭐ mastery based on the real backend spaced-repetition bin
- ✨ animated answer/reward feedback
- 🗺️ 12-level mastery map
- 🏆 checkpoint and deck-completion states
- ⌨️ keyboard controls: `Space` reveal, `1` missed, `2` nailed it
- 🧪 **Deck Lab** for card administration
- 🗺️ **Deck Map** for learning progress + runtime status

XP and combo values are intentionally session-local presentation state. **Durable mastery, review history, and card state live in PostgreSQL.**

---

# 🧠 Spaced repetition

Cards move through **12 mastery bins (`0`–`11`)**. Higher bins wait longer before becoming due again.

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

- **Correct** → advance one bin.
- **Wrong** → return to bin 1 and increment the lifetime wrong count.
- Repeated misses can mark a card `hard_to_remember`.
- Terminal mastery removes a card from the active study queue.
- Due cards are selected before new cards.
- Every submitted answer creates a `Review` record for later analytics.

---

# 🏗️ Architecture

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

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Axios, React Router |
| Backend | FastAPI, SQLModel / SQLAlchemy, Pydantic Settings, Uvicorn |
| Database | PostgreSQL 16 |
| Schema lifecycle | Alembic |
| Containers | Docker + Docker Compose |
| Docs | MkDocs Material + mkdocstrings + TypeDoc |
| CI | GitHub Actions |

---

# 🛠️ Platform Engineering built into FlashQuest

| Area | Implementation |
| --- | --- |
| **Liveness** | lightweight process/service endpoint |
| **Readiness** | executes a real database query; returns `503` when PostgreSQL is unavailable |
| **Request correlation** | caller-provided or generated `X-Request-ID` |
| **Timing** | `X-Response-Time-Ms` on API responses |
| **Configuration** | environment-driven DB, CORS, app environment/version, and frontend API URL |
| **Database lifecycle** | explicit Alembic migrations; startup does not silently mutate schema |
| **Seed lifecycle** | reproducible, versioned, idempotent 216-card curriculum |
| **Containers** | React/FastAPI/Postgres Compose stack; API runs as a non-root user |
| **Dependency ordering** | API waits for PostgreSQL health; web waits for API readiness |
| **CI/CD** | backend matrix, frontend lint/build, PostgreSQL migration smoke test, image builds |
| **State boundaries** | durable domain state in PostgreSQL; ephemeral game feedback in the browser session |

See [`docs/PLATFORM_ENGINEERING.md`](docs/PLATFORM_ENGINEERING.md) for the deeper architecture and operational design.

---

# ❤️ Health and readiness

```text
GET /health
GET /health/live
GET /health/ready
```

- `/health` — backwards-compatible lightweight response.
- `/health/live` — confirms the service process is alive and exposes service metadata.
- `/health/ready` — verifies the API can query PostgreSQL and returns `503` when it cannot.

API responses also include:

```text
X-Request-ID
X-Response-Time-Ms
```

If the caller supplies `X-Request-ID`, FlashQuest propagates it. Otherwise the API generates one.

---

# 🗃️ Database migrations

After starting a **fresh** database, apply migrations before seeding:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini upgrade head
```

Create a migration after changing models:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini revision --autogenerate -m "describe change"
```

Inspect migration state:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini current
```

CI provisions a clean PostgreSQL 16 instance and runs `alembic upgrade head`, so migration failures are caught before merge.

---

# ✅ CI quality gates

Pull requests validate four layers:

1. **Backend — Python 3.11 + 3.12**
   - compile
   - pytest
   - curriculum size/balance/idempotency tests
   - Ruff
   - Black check
2. **Frontend**
   - clean `npm ci`
   - ESLint
   - TypeScript + production Vite build
3. **Database migrations**
   - clean PostgreSQL 16 service
   - Alembic upgrade to `head`
4. **Containers**
   - `docker compose config`
   - API image build
   - web image build

CI is intentionally a **quality gate**, not a workflow that silently rewrites contributor code and pushes it back to the branch.

---

# 💻 Development without Docker

### Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

python -m pip install -r requirements.txt
alembic -c alembic.ini upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

### Quality checks

```bash
# backend
cd backend
python -m pytest -q
ruff check . --exclude alembic/versions
black --check . --extend-exclude 'alembic/versions'

# frontend
cd frontend
npm run lint
npm run build
```

---

# 📁 Repository layout

```text
.
├── .github/workflows/          # CI + docs workflows
├── backend/
│   ├── alembic/                # schema migrations
│   ├── app/
│   │   ├── data/
│   │   │   ├── platform_engineering_cards.json
│   │   │   └── platform_engineering_labs.json
│   │   ├── routers/            # cards + study API routes
│   │   ├── main.py             # FastAPI + operational endpoints
│   │   ├── models.py           # persistent domain models
│   │   └── seed.py             # curriculum loader + idempotent seeder
│   ├── tests/                  # domain, API, operations, seed regression tests
│   └── Dockerfile
├── frontend/
│   ├── src/pages/              # Memory Quest, Deck Lab, Deck Map
│   ├── src/api.ts              # typed API client
│   └── Dockerfile
├── docs/                       # MkDocs + Platform Engineering docs
├── docker-compose.yml
└── mkdocs.yml
```

---

# 🎯 Why this belongs in a Platform Engineering portfolio

FlashQuest is both **the project and the practice environment**.

You can use it to prepare answers for questions such as:

- What is the difference between liveness and readiness?
- Why does this Kubernetes Service have no endpoints?
- Why does a test pass locally and fail in CI?
- Why does Terraform want to replace this database?
- How would you roll out a risky schema migration?
- Why are DB connections exhausted?
- How should retries, backoff, jitter, and idempotency interact?
- How do request IDs help during distributed troubleshooting?
- What is mitigation versus root-cause analysis during an incident?

At the same time, the repository gives you concrete implementation decisions to discuss:

- dependency-aware startup;
- reproducible environment data;
- explicit schema lifecycle management;
- non-root container execution;
- CI migration validation;
- operational endpoint design;
- durable versus ephemeral state boundaries;
- automated regression coverage for the study curriculum itself.

---

## Stop / reset

Stop the stack:

```bash
docker compose down
```

Delete the local PostgreSQL volume and start from scratch:

```bash
docker compose down -v
```

Then repeat **start → migrate → seed** from the Quick start section.

---

<div align="center">

### ⚡ FlashQuest

**Learn it. Break it. Fix it. Remember it.**

</div>
