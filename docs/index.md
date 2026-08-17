# FlashQuest’s 🎮🧠

<div class="fq-hero" markdown>

## Learn it. Break it. Fix it. Remember it.

**FlashQuest’s** is a game-like Platform Engineering study and troubleshooting environment built with React, FastAPI, PostgreSQL, Alembic, Docker, and GitHub Actions.

It combines a **216-card curriculum** with hands-on break/fix scenarios and a real full-stack application you can inspect while you study.

</div>

<div class="fq-grid" markdown>

<div class="fq-card" markdown>
**144 concept cards**

Interview-style questions covering the systems Platform Engineers work with.
</div>

<div class="fq-card" markdown>
**72 break/fix labs**

Operational scenarios: diagnose the symptoms, choose the next signal, and recover safely.
</div>

<div class="fq-card" markdown>
**12 domains**

Linux through incident response, with 18 challenges in every domain.
</div>

<div class="fq-card" markdown>
**12 mastery levels**

PostgreSQL-backed spaced repetition tracks durable progress while session XP keeps studying fun.
</div>

</div>

## 🧭 Pick your path

=== "Study"

    Start with the [Platform Engineering curriculum](CURRICULUM.md), then use the [Break/Fix Labs](LABS.md) to practice applying the concepts under pressure.

=== "Build"

    Read the [Platform Engineering architecture](PLATFORM_ENGINEERING.md) to see how FlashQuest’s handles health checks, migrations, configuration, containers, and CI quality gates.

=== "Operate"

    Use the [Operations & Deployment guide](OPERATIONS.md) for startup order, diagnostics, database lifecycle, Docker commands, and deployment boundaries.

=== "Inspect the code"

    Jump into the generated [Backend API](backend/api.md) or [Frontend reference](frontend/modules.md).

---

## ⚡ Quick start

A fresh environment should come up in this order:

**start → migrate → seed → verify**

```bash
git clone https://github.com/mergemaven11/FlashQuest.git
cd FlashQuest

docker compose up --build -d

docker compose exec api \
  alembic -c /app/alembic.ini upgrade head

docker compose exec api python -m app.seed
```

Verify the runtime:

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

Then open:

- **FlashQuest’s game UI:** `http://localhost:5173`
- **FastAPI / OpenAPI:** `http://localhost:8080/docs`
- **Readiness endpoint:** `http://localhost:8080/health/ready`

!!! tip "Seeding is safe to repeat"
    The built-in curriculum seeder is idempotent. Existing prompts are reused, new curriculum cards are inserted, and missing default-user progress rows are repaired without duplicating the deck.

---

## 📚 What you study

Every domain contains **12 concept cards + 6 practical lab scenarios**.

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

The curriculum itself is versioned under:

```text
backend/app/data/
├── platform_engineering_cards.json
└── platform_engineering_labs.json
```

[Explore the full curriculum →](CURRICULUM.md){ .md-button .md-button--primary }
[Try the lab format →](LABS.md){ .md-button }

---

## 🏗️ Runtime architecture

```text
Browser
  │
  ▼
React / TypeScript SPA
  │ HTTP / JSON
  ▼
FastAPI
  │ SQLModel / SQLAlchemy
  ▼
PostgreSQL 16
  ▲
  │ schema lifecycle
Alembic
```

FlashQuest’s deliberately separates **application liveness** from **dependency readiness**, validates migrations in CI, runs the API container as a non-root user, and keeps durable study state in PostgreSQL while browser-session game feedback remains ephemeral.

[Read the architecture decisions →](PLATFORM_ENGINEERING.md){ .md-button }

---

## ✅ Quality gates

Changes are validated across the same boundaries the application depends on:

1. **Backend** — Python 3.11/3.12, compile, pytest, Ruff correctness, Black formatting.
2. **Frontend** — clean install, ESLint, TypeScript, Vite production build.
3. **Database** — clean PostgreSQL 16 + Alembic upgrade to `head`.
4. **Containers** — Compose validation plus API and web image builds.
5. **Documentation** — MkDocs + TypeDoc build checks.

That gives FlashQuest’s two jobs at once: **help you study Platform Engineering and give you a Platform Engineering project to talk about.**
