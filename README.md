# FlashQuest’s 🎮🧠

**Learn it. Break it. Fix it. Remember it.**

FlashQuest’s is a reusable, game-like study engine built with **React, FastAPI, PostgreSQL, Alembic, and Docker**.

Start instantly with a featured **216-card Platform Engineering deck**, then create a verified account and make private decks for anything you want to learn.

[![CI](https://github.com/mergemaven11/FlashQuest/actions/workflows/ci.yml/badge.svg)](https://github.com/mergemaven11/FlashQuest/actions/workflows/ci.yml)
[![Docs Build](https://github.com/mergemaven11/FlashQuest/actions/workflows/docs-deploy.yml/badge.svg)](https://github.com/mergemaven11/FlashQuest/actions/workflows/docs-deploy.yml)
[![Docs](https://img.shields.io/badge/docs-live-ffba08)](https://flashquest-docs.netlify.app/)

**App:** https://flaskquest.netlify.app/  
**Docs:** https://flashquest-docs.netlify.app/

---

## What FlashQuest’s does

### ⭐ Try the featured Platform Engineering deck

No account is required to understand the product. The starter pack contains:

- **144 concept / interview cards**
- **72 break/fix lab cards**
- **12 Platform Engineering domains**
- **216 total challenges**
- **12 spaced-repetition mastery levels**

### ✨ Make your own deck

The product flow is:

```text
Try featured demo
      ↓
Sign up
      ↓
Verify email
      ↓
Sign in
      ↓
Create private deck
      ↓
Add concept + lab cards
      ↓
Study with XP + mastery + spaced repetition
```

A custom deck can be anything: AWS, Python, Spanish, certification prep, school notes, interview questions, database engineering, or another topic entirely.

Users can also **copy the featured Platform Engineering deck** into their account and customize their private copy without changing the public demo.

---

## 🎮 Study loop

The Play screen explains itself in simple steps:

1. **Pick a deck.**
2. **Read the question and think first.**
3. **Reveal the answer.**
4. **Choose Missed it or Got it.**
5. **Keep going — weak cards return sooner.**

A **concept** card teaches an idea. A **lab** card asks you to pretend something is broken or needs to be built, explain what you would check first, then compare your answer with a recovery/implementation path.

Game feedback includes:

- session XP + player levels
- combos + best streak
- accuracy
- backend-backed mastery
- 12-level mastery map
- keyboard controls: `Space` reveal, `1` missed, `2` got it

XP/streak presentation is session-local. Durable accounts, decks, cards, mastery, and review history live in PostgreSQL.

---

## 🔐 Accounts and email verification

Custom deck creation requires a verified account.

Security boundaries include:

- salted **PBKDF2-HMAC-SHA256** password hashes;
- high-entropy opaque bearer sessions stored in PostgreSQL **only as SHA-256 hashes**;
- one-time, expiring email-verification tokens stored only as hashes;
- private deck/card APIs scoped to the signed-in owner;
- built-in starter content read-only for normal users;
- server-side `DEMO_DELETE_PASSWORD` protection for destructive demo maintenance.

Local development uses `EMAIL_DELIVERY_MODE=console`, which prints verification URLs to API logs. Hosted delivery is designed for **Resend**.

See [Accounts & Email Verification](docs/AUTHENTICATION.md).

---

## 📚 Featured Platform Engineering curriculum

Every domain contains **12 concepts + 6 labs = 18 challenges**.

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

Versioned starter data lives in:

```text
backend/app/data/
├── platform_engineering_cards.json
└── platform_engineering_labs.json
```

The seeder is idempotent and repairs the featured deck/card metadata and missing anonymous-demo progress without duplicating content.

---

## 🏗️ Architecture

```text
Browser
  │
  ▼
React / TypeScript
  │ HTTP / JSON + bearer session
  ▼
FastAPI
  │
  ├── Resend (email verification)
  │
  ▼
PostgreSQL 16
  ▲
  │ schema lifecycle
Alembic
```

Persistent product model:

```text
User
  └── Deck
       └── Card
            ├── domain / category
            └── kind: concept | lab

User + Card
  └── UserCard mastery state
       └── Review history
```

The anonymous public demo uses a reserved demo study identity; authenticated users receive their own mastery state even when studying the featured deck.

---

## 🚀 Quick start

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

Verify:

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

Open:

- React: `http://localhost:5173`
- FastAPI/OpenAPI: `http://localhost:8080/docs`
- readiness: `http://localhost:8080/health/ready`

For local email verification, watch API logs after signup for the verification URL.

---

## 🌐 Hosted deployment

### React / Netlify

```text
Site: flaskquest
URL: https://flaskquest.netlify.app/
Base directory: frontend
Build command: npm run build
Publish directory: dist
VITE_API_URL=https://flashcards-tobias.fly.dev
```

### MkDocs / Netlify

```text
Site: flashquest-docs
URL: https://flashquest-docs.netlify.app/
Publish directory: site
```

The root `netlify.toml` belongs to the MkDocs site, not the React application.

### FastAPI / Fly.io

The Fly release command runs:

```text
alembic upgrade head && python -m app.seed
```

Before public signup works in hosted `resend` mode, configure at least:

```bash
fly secrets set \
  RESEND_API_KEY='...' \
  DEMO_DELETE_PASSWORD='...' \
  -a flashcards-tobias
```

Configure `EMAIL_FROM` to a sender accepted by your Resend account.

**Netlify deploying the frontend does not migrate PostgreSQL.** The backend commit must also deploy to Fly so the account/deck migration and seed release command run.

---

## ❤️ Operational endpoints

```text
GET /health
GET /health/live
GET /health/ready
```

- `/health/live` confirms the process is alive.
- `/health/ready` executes a real PostgreSQL query and returns `503` when the dependency is unavailable.

Every API response also receives:

```text
X-Request-ID
X-Response-Time-Ms
```

---

## ✅ CI quality gates

Pull requests validate:

1. **Backend** — Python 3.11/3.12, compile, pytest, Ruff, Black.
2. **Frontend** — ESLint + TypeScript/Vite production build.
3. **Database** — Alembic against clean PostgreSQL 16.
4. **Containers** — Compose model + API/web image builds.
5. **Docs** — strict MkDocs + TypeDoc build.

---

## 📁 Key paths

```text
backend/app/
├── data/              # featured curriculum JSON
├── routers/
│   ├── auth.py        # signup / verify / login / logout
│   ├── decks.py       # featured + owned decks
│   ├── cards.py       # owner-scoped card CRUD
│   └── study.py       # deck-aware spaced repetition
├── email_service.py   # verification delivery
├── security.py        # password + opaque-session primitives
├── models.py          # users, decks, cards, progress
└── seed.py            # featured deck seeder

frontend/src/
├── pages/             # landing, auth, Play, My Decks, Deck Lab
├── auth.tsx           # account state
├── api.ts             # typed API client
└── index.css          # ember/amber visual system

docs/
├── MAKE_YOUR_OWN_DECK.md
├── AUTHENTICATION.md
├── OPERATIONS.md
└── PLATFORM_ENGINEERING.md
```

---

## 🎯 Portfolio story

FlashQuest’s now demonstrates more than CRUD:

- reusable product/data modeling;
- account ownership boundaries;
- email-verification lifecycle;
- password/token handling;
- explicit migration + seed lifecycle;
- environment-driven deployment configuration;
- liveness/readiness semantics;
- request correlation;
- non-root containers;
- PostgreSQL migration smoke tests;
- multi-runtime CI quality gates;
- a public demo separated from private user content.

It remains grounded: this is a portfolio-grade full-stack platform, not a claim of hyperscale production operation.

---

<div align="center">

### ⚡ FlashQuest’s

**Featured Platform Engineering. Your decks next.**

</div>
