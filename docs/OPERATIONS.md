# Operations & deployment ⚙️

This is the runbook for operating FlashQuest’s locally and understanding the production boundaries between the React app, FastAPI, PostgreSQL, email verification, Netlify, and Fly.io.

## Runtime topology

```text
browser
  │
  ▼
React / Netlify
  │ HTTPS + bearer session
  ▼
FastAPI / Fly.io
  │
  ├── Resend API (verification email)
  │
  ▼
PostgreSQL
```

The data plane stores:

- accounts and verification state;
- hashed opaque auth sessions;
- featured and user-owned decks;
- cards;
- per-user mastery state;
- review history.

---

## Fresh local environment

```bash
git clone https://github.com/mergemaven11/FlashQuest.git
cd FlashQuest

docker compose up --build -d
```

Apply the schema:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini upgrade head
```

Seed the featured Platform Engineering deck:

```bash
docker compose exec api python -m app.seed
```

Verify:

```bash
docker compose ps
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

Open:

- app: `http://localhost:5173`
- API docs: `http://localhost:8080/docs`

!!! important "Migrate before seeding"
    The API does not silently create tables at process startup. Alembic owns schema lifecycle; the curriculum seeder owns featured starter data.

---

## Featured seed lifecycle

The seeder is **idempotent**. Running it repeatedly:

1. creates or repairs the built-in `Platform Engineering` deck;
2. inserts missing cards;
3. repairs built-in metadata and deck membership;
4. creates missing anonymous-demo progress rows;
5. does not duplicate existing content.

The featured deck contains **216 cards: 144 concepts + 72 labs**.

Fly’s release command is configured to run:

```text
alembic upgrade head && python -m app.seed
```

That means a backend release applies the schema before repairing the featured content.

---

## Health semantics

| Endpoint | Meaning | PostgreSQL required? |
| --- | --- | --- |
| `GET /health` | lightweight backwards-compatible process health | No |
| `GET /health/live` | process is alive + service metadata | No |
| `GET /health/ready` | API can execute a database query | **Yes** |

A live process can still be unready when PostgreSQL is unavailable.

```bash
curl -i http://localhost:8080/health/live
curl -i http://localhost:8080/health/ready
```

If liveness succeeds but readiness returns `503`, investigate the database/network path before restarting the API blindly.

---

## Runtime configuration

| Variable | Purpose | Secret? |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL / SQLAlchemy connection string | Usually |
| `APP_ENV` | runtime environment label | No |
| `APP_VERSION` | API version metadata | No |
| `LOG_LEVEL` | logging configuration | No |
| `ALLOWED_ORIGINS` | extra CORS browser origins | No |
| `ACCESS_TOKEN_MINUTES` | opaque bearer-session lifetime | No |
| `FRONTEND_URL` | base URL used in verification links | No |
| `EMAIL_DELIVERY_MODE` | `console` locally or `resend` hosted | No |
| `RESEND_API_KEY` | Resend API credential | **Yes** |
| `EMAIL_FROM` | verification sender identity | No |
| `VERIFICATION_TOKEN_MINUTES` | email-link lifetime | No |
| `DEMO_DELETE_PASSWORD` | owner-only built-in deletion/reset guard | **Yes** |
| `VITE_API_URL` | FastAPI URL compiled into React | No |

Do not commit production credentials to the repository.

### Hosted email verification

Fly is configured for:

```text
EMAIL_DELIVERY_MODE=resend
FRONTEND_URL=https://flaskquest.netlify.app
```

Before enabling public signup, configure the provider secret and demo-owner secret:

```bash
fly secrets set \
  RESEND_API_KEY='...' \
  DEMO_DELETE_PASSWORD='...' \
  -a flashcards-tobias
```

You should also configure `EMAIL_FROM` to a sender/domain accepted by your Resend account.

!!! warning "Signup depends on email delivery"
    If the hosted API is in `resend` mode without a working `RESEND_API_KEY`, the account row can be created but delivery returns a service error. Once the provider is configured, the user can request **Resend verification**.

---

## Authentication diagnostics

### User cannot sign in

Check:

1. the account exists;
2. email is verified;
3. the password matches;
4. bearer session has not expired/revoked;
5. browser requests contain `Authorization: Bearer ...`.

### Verification email never arrives

Check:

1. `EMAIL_DELIVERY_MODE`;
2. `RESEND_API_KEY` is present in Fly secrets;
3. `EMAIL_FROM` is allowed by the provider;
4. `FRONTEND_URL` points at the current app URL;
5. Fly/API logs for provider HTTP errors.

Local mode intentionally prints the verification URL to the API logs:

```text
EMAIL_DELIVERY_MODE=console
```

### Verification link expired

Links are one-time tokens and expire. Use the **Resend verification** flow to create a fresh token; older unused links are invalidated.

---

## Deck ownership and demo protection

The built-in Platform Engineering deck is public to read/study. Custom decks belong to their verified creator.

API boundaries enforce:

- anonymous users see built-in content only;
- signed-in users see built-ins + their own decks;
- users can mutate only their own custom decks/cards;
- featured content is read-only through normal user routes;
- destructive maintenance on built-ins requires the server-side demo password.

The demo password is never compiled into the React bundle.

---

## Database lifecycle

Inspect migration state:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini current
```

Upgrade:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini upgrade head
```

Create a migration after changing persistent models:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini revision --autogenerate -m "describe change"
```

CI provisions clean PostgreSQL 16 and runs `alembic upgrade head` so migration failures are caught before merge.

---

## Request diagnostics

API responses include:

```text
X-Request-ID
X-Response-Time-Ms
```

Send a known request id when reproducing a problem:

```bash
curl -i \
  -H 'X-Request-ID: debug-001' \
  http://localhost:8080/health/live
```

Use the same id to correlate client symptoms with API/proxy logs.

---

## Docker commands

```bash
# state
docker compose ps

# API logs
docker compose logs --tail=200 api

# DB logs
docker compose logs --tail=200 db

# follow both
docker compose logs -f api db

# stop
docker compose down
```

Destroy the local database only when you intentionally want a clean environment:

```bash
docker compose down -v
```

Then repeat **start → migrate → seed → verify**.

---

## Netlify deployments

FlashQuest’s has two separate Netlify concerns:

### React application

```text
Site: flaskquest
URL: https://flaskquest.netlify.app/
Base directory: frontend
Build command: npm run build
Publish directory: dist
VITE_API_URL: https://flashcards-tobias.fly.dev
```

### MkDocs documentation

```text
Site: flashquest-docs
URL: https://flashquest-docs.netlify.app/
Publish directory: site
```

The root `netlify.toml` belongs to **MkDocs**, not the React application.

A docs deploy may be intentionally skipped/canceled when no docs-relevant paths changed. That optimization is not itself a build failure.

---

## Fly deployment boundary

Netlify deploying the React bundle **does not migrate PostgreSQL**.

The account/deck schema and featured seed become production-ready only after the corresponding backend commit is deployed to Fly. Fly then executes the configured release command before starting the new app version.

For this V1, production rollout order is:

1. configure required Fly secrets;
2. deploy FastAPI/Fly commit;
3. confirm migration + seed release command succeeded;
4. verify `/health/ready`;
5. deploy/confirm React frontend;
6. test signup → verification → login → create deck;
7. confirm MkDocs deployment.

---

## CI quality gates

Application CI validates:

- Python 3.11/3.12 tests;
- Ruff correctness checks;
- Black checks for upgraded backend code;
- frontend ESLint + production Vite build;
- clean PostgreSQL migration to Alembic `head`;
- Compose configuration;
- API/web container builds.

Documentation CI separately runs MkDocs + TypeDoc with strict build checking.

---

## Failure triage

| Symptom | First checks |
| --- | --- |
| Play shows `Network Error` | `VITE_API_URL`, Fly health, CORS, browser network tab |
| API live but not ready | PostgreSQL health/network/`DATABASE_URL` |
| Featured deck empty | migration state, release seed output, `python -m app.seed` |
| Signup 503 after account creation | Resend key/sender/provider logs |
| Login 403 | email verification state |
| Custom deck invisible | bearer session + ownership scope |
| User cannot modify a card | deck ownership / built-in protection |
| Docs old after merge | Netlify `flashquest-docs` production deploy status |
| Migration fails | first failing Alembic revision on clean PostgreSQL |

The operational loop remains:

**observe → narrow → mitigate → verify → prevent**

[Account model →](AUTHENTICATION.md){ .md-button }
[Custom decks →](MAKE_YOUR_OWN_DECK.md){ .md-button }
[Architecture →](PLATFORM_ENGINEERING.md){ .md-button .md-button--primary }
