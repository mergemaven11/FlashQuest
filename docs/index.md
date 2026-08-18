# FlashQuest’s 🎮🧠

<div class="fq-hero" markdown>

## Learn it. Break it. Fix it. Remember it.

**FlashQuest’s** is a reusable, game-like study engine built with React, FastAPI, PostgreSQL, Alembic, and Docker.

Start instantly with the featured **216-card Platform Engineering deck**. Then create a verified account and build private decks for **anything you want to learn**.

[Open FlashQuest’s →](https://flaskquest.netlify.app/){ .md-button .md-button--primary }
[Make your own deck →](MAKE_YOUR_OWN_DECK.md){ .md-button }

</div>

<div class="fq-grid" markdown>

<div class="fq-card" markdown>
**Try before signing up**

The featured Platform Engineering deck is public, so visitors can understand the study loop immediately.
</div>

<div class="fq-card" markdown>
**Verify once, build anything**

Sign up, verify your email, then create private decks with concept cards and break/fix labs.
</div>

<div class="fq-card" markdown>
**216-card starter pack**

144 Platform Engineering concepts + 72 practical troubleshooting labs across 12 domains.
</div>

<div class="fq-card" markdown>
**12 mastery levels**

Spaced repetition stores durable progress in PostgreSQL while XP and streaks make each session feel like a game.
</div>

</div>

## 🧭 How the product works

```text
Visitor
  │
  ├── Play featured Platform Engineering deck
  │
  └── Sign up
       │
       ▼
Verify email
       │
       ▼
Sign in
       │
       ├── Create private deck
       ├── Copy + customize featured deck
       ├── Add concept / lab cards
       └── Study with personal progress
```

### The UI explains the loop in five tiny steps

1. **Pick a deck.**
2. **Read the question and think first.**
3. **Reveal the answer.**
4. **Choose Missed it or Got it.**
5. **Keep going — weaker cards return sooner.**

For a **lab** card, pretend the system is broken, say what you would inspect first, then reveal the suggested recovery path.

---

## ✨ Make your own deck

Platform Engineering is the first built-in pack, not the limit of the product.

A verified user can create decks for topics such as:

- AWS, Azure, Linux, Kubernetes, Security+, or Terraform;
- Python, SQL, coding interviews, and database engineering;
- school subjects;
- language learning;
- certifications;
- personal study notes.

Each card belongs to a **Deck** and carries a category/domain plus a type:

```text
User
  └── Deck
       └── Card
            ├── domain / category
            └── kind: concept | lab
```

The same study engine works for every deck.

[See the custom-deck flow →](MAKE_YOUR_OWN_DECK.md){ .md-button .md-button--primary }
[Read the account security model →](AUTHENTICATION.md){ .md-button }

---

## ⭐ Featured Platform Engineering deck

The starter deck includes **216 challenges**:

| Content | Count |
| --- | ---: |
| Concept / interview cards | 144 |
| Break/Fix labs | 72 |
| Domains | 12 |
| **Total cards** | **216** |

The built-in content covers Linux, networking, containers, Kubernetes, CI/CD, cloud, Terraform/IaC, observability, databases, security, SRE/reliability, and incident response.

[Explore the curriculum →](CURRICULUM.md){ .md-button }
[See the lab format →](LABS.md){ .md-button }

---

## 🔐 Accounts and email verification

Custom deck creation is unlocked after email verification.

FlashQuest’s uses:

- salted PBKDF2-HMAC-SHA256 password hashes;
- high-entropy opaque bearer sessions stored only as hashes;
- one-time, expiring email-verification tokens stored only as hashes;
- owner-scoped deck/card APIs;
- server-side password protection for destructive maintenance on the public demo deck.

Hosted verification emails are designed to use **Resend**. Local development can print verification URLs to the API log instead.

[Accounts & email verification →](AUTHENTICATION.md){ .md-button .md-button--primary }

---

## ⚡ Local quick start

A fresh environment comes up in this order:

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

Open:

- **React app:** `http://localhost:5173`
- **FastAPI / OpenAPI:** `http://localhost:8080/docs`
- **Readiness:** `http://localhost:8080/health/ready`

!!! tip "The featured seed is idempotent"
    Re-running the seeder repairs the built-in Platform Engineering deck, its 216 cards, metadata, and missing anonymous-demo progress without duplicating content.

---

## 🏗️ Runtime architecture

```text
Browser
  │
  ▼
React / TypeScript SPA
  │ HTTP / JSON + bearer session
  ▼
FastAPI
  │ SQLModel / SQLAlchemy
  ▼
PostgreSQL 16
  ▲
  │ schema lifecycle
Alembic
```

The application separates liveness from database-backed readiness, validates migrations in CI, runs its API container as a non-root user, and keeps durable accounts/decks/cards/progress in PostgreSQL.

[Architecture decisions →](PLATFORM_ENGINEERING.md){ .md-button }
[Operations & deployment →](OPERATIONS.md){ .md-button }

---

## ✅ Quality gates

Pull requests validate:

1. backend tests on Python 3.11 and 3.12;
2. Ruff correctness and Black formatting checks;
3. frontend ESLint + TypeScript/Vite production build;
4. Alembic against clean PostgreSQL 16;
5. Docker Compose + API/web image builds;
6. strict MkDocs + TypeDoc documentation builds.

FlashQuest’s is therefore both **a study product** and **a portfolio project demonstrating platform-minded software delivery**.
