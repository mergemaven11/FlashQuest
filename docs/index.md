# FlashQuest’s 🎮🧠

**Learn it. Break it. Fix it. Remember it.**

FlashQuest’s is a game-like **Platform Engineering study and troubleshooting app** built with React, FastAPI, PostgreSQL, Alembic, and Docker.

It ships with a built-in **216-card Platform Engineering curriculum**:

- **144 concept / interview cards** for core knowledge;
- **72 hands-on lab / break-fix cards** for operational scenarios;
- **12 domains** spanning Linux, networking, containers, Kubernetes, CI/CD, cloud, Terraform/IaC, observability, databases, security, SRE/reliability, and incident response;
- PostgreSQL-backed spaced-repetition progress across **12 mastery levels**;
- session XP, combos, accuracy, checkpoints, and mastery feedback.

The repository is also a Platform Engineering portfolio project: dependency-aware readiness, Alembic migrations, request correlation, non-root containers, environment-driven configuration, PostgreSQL migration testing, and CI quality gates.

---

## 🧪 Learn it, then fix it

Concept cards ask questions such as:

```text
Kubernetes · What is the difference between liveness and readiness probes?
Terraform · What does drift mean?
Observability · What is an error budget?
```

Lab cards put you into operational situations:

```text
LAB · Kubernetes · A Service has no traffic even though Pods are Running.
What do you check?

LAB · CI/CD · Tests pass locally but fail in CI.
What do you compare first?

LAB · Databases · The API reports "too many connections".
What do you inspect and fix?
```

The curriculum is versioned as data under `backend/app/data/`, and the seed process is idempotent so curriculum updates can be loaded without duplicating existing cards or study-progress rows.

---

## 🚀 Quick start

A fresh environment should be started in this order: **start → migrate → seed → verify**.

```bash
git clone https://github.com/mergemaven11/flashcards.git
cd flashcards

docker compose up --build -d

docker compose exec api \
  alembic -c /app/alembic.ini upgrade head

docker compose exec api python -m app.seed
```

Open:

- **FlashQuest’s:** `http://localhost:5173`
- **FastAPI / OpenAPI:** `http://localhost:8080/docs`
- **Readiness:** `http://localhost:8080/health/ready`

Verify:

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

---

## 🏗️ Runtime architecture

```text
React / TypeScript SPA
        |
        | HTTP / JSON
        v
FastAPI application
        |
        | SQLModel / SQLAlchemy
        v
PostgreSQL 16
        ^
        |
Alembic migrations
```

Local Docker Compose keeps those same service boundaries: web, API, and database.

---

## ❤️ Operational model

FlashQuest’s separates liveness from readiness:

- `GET /health` — backwards-compatible lightweight health response;
- `GET /health/live` — confirms the API process is alive and returns service metadata;
- `GET /health/ready` — executes a database query and returns `503` when PostgreSQL is unavailable.

API responses also include `X-Request-ID` and `X-Response-Time-Ms` for request correlation and basic latency visibility.

---

## ✅ CI quality gates

Pull requests validate:

1. backend tests on Python 3.11 and 3.12;
2. Ruff correctness checks and Black formatting checks;
3. frontend ESLint and TypeScript/Vite production builds;
4. Alembic migration against clean PostgreSQL 16;
5. Docker Compose configuration plus API and web image builds;
6. MkDocs / TypeDoc documentation build.

---

## 🧭 Docs map

- [Platform Engineering design](PLATFORM_ENGINEERING.md)
- [Backend API reference](backend/api.md)
- [Frontend reference](frontend/modules.md)

The deeper Platform Engineering page explains health semantics, configuration, failure boundaries, CI design, and portfolio/interview talking points.
