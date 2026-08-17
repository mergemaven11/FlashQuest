# Operations & deployment ⚙️

This page is the runbook for operating FlashQuest’s locally and understanding its deployment boundaries.

## Runtime topology

```text
browser
  │
  ▼
web (React/Nginx)
  │
  ▼
api (FastAPI/Uvicorn)
  │
  ▼
db (PostgreSQL 16)
```

Docker Compose enforces dependency-aware startup:

1. PostgreSQL starts and passes `pg_isready`.
2. The API starts only after the database is healthy.
3. The web container starts only after the API passes `/health/ready`.

---

## Fresh local environment

```bash
git clone https://github.com/mergemaven11/FlashQuest.git
cd FlashQuest

docker compose up --build -d
```

Apply the schema explicitly:

```bash
docker compose exec api \
  alembic -c /app/alembic.ini upgrade head
```

Seed the built-in curriculum:

```bash
docker compose exec api python -m app.seed
```

Verify all three services:

```bash
docker compose ps
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

Open the application at `http://localhost:5173`.

!!! important "Migrate before seeding"
    FlashQuest’s does not silently mutate the schema on API startup. On a fresh database, run Alembic before the curriculum seeder.

---

## Health semantics

| Endpoint | Meaning | Database required? |
| --- | --- | --- |
| `GET /health` | lightweight backwards-compatible health response | No |
| `GET /health/live` | process/service is alive; includes service metadata | No |
| `GET /health/ready` | API can serve traffic including critical DB access | **Yes** |

A process can be alive while the service is not ready. This distinction lets an orchestrator avoid sending traffic to an API that cannot reach PostgreSQL without treating every dependency outage as a crashed process.

### Quick diagnosis

```bash
curl -i http://localhost:8080/health/live
curl -i http://localhost:8080/health/ready
```

If liveness succeeds but readiness returns `503`, investigate PostgreSQL connectivity before restarting the API blindly.

---

## Request diagnostics

Every API response includes:

```text
X-Request-ID
X-Response-Time-Ms
```

If a client sends `X-Request-ID`, the API propagates it. Otherwise FlashQuest’s generates one.

Use that ID to correlate a user-facing failure with API or proxy logs.

```bash
curl -i \
  -H 'X-Request-ID: lab-incident-001' \
  http://localhost:8080/health/live
```

---

## Useful Docker commands

### Service state

```bash
docker compose ps
```

### API logs

```bash
docker compose logs --tail=200 api
```

### PostgreSQL logs

```bash
docker compose logs --tail=200 db
```

### Follow logs

```bash
docker compose logs -f api db
```

### Restart one service

```bash
docker compose restart api
```

### Stop the stack

```bash
docker compose down
```

### Destroy the local database volume

```bash
docker compose down -v
```

!!! warning "`down -v` deletes local database state"
    Use it only when you intentionally want a clean local PostgreSQL volume. Afterward repeat **start → migrate → seed → verify**.

---

## Database lifecycle

### Current migration

```bash
docker compose exec api \
  alembic -c /app/alembic.ini current
```

### Upgrade to head

```bash
docker compose exec api \
  alembic -c /app/alembic.ini upgrade head
```

### Create a migration after model changes

```bash
docker compose exec api \
  alembic -c /app/alembic.ini revision --autogenerate -m "describe change"
```

CI provisions a clean PostgreSQL 16 service and upgrades it to Alembic `head`, catching migrations that only work against a developer’s existing database.

---

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL / SQLAlchemy connection string |
| `APP_ENV` | runtime environment label |
| `APP_VERSION` | service version returned by operational metadata |
| `LOG_LEVEL` | application logging level/configuration input |
| `ALLOWED_ORIGINS` | browser origins allowed through CORS |
| `VITE_API_URL` | API base URL compiled into the React frontend |

Keep environment-specific credentials and secrets outside the repository.

---

## CI gates

The application pipeline validates:

- backend compilation and tests on Python 3.11 and 3.12;
- Ruff correctness checks;
- Black formatting checks for upgraded platform code;
- frontend ESLint + TypeScript/Vite build;
- Alembic migration against clean PostgreSQL 16;
- Docker Compose configuration;
- API and web container builds.

The docs pipeline separately builds MkDocs + TypeDoc, keeping documentation failures isolated from application CI while still blocking broken docs changes in pull requests.

---

## Netlify docs deployment

The **root `netlify.toml` is the documentation deployment**, not the React application deployment.

Its docs build:

1. creates a Python virtual environment;
2. installs MkDocs Material and mkdocstrings;
3. installs backend requirements so Python API references can import;
4. runs the frontend TypeDoc generation;
5. runs `mkdocs build --strict`;
6. publishes the generated `site/` directory.

The config also uses a content-change filter. A Netlify deploy may be **canceled intentionally** when none of these paths changed:

```text
mkdocs.yml
docs/
frontend/
backend/
.github/workflows/
```

That “canceled due to no content change” result is an optimization, not a build failure.

### React application deployment

Treat the React application as a separate web deployment concern. For a Netlify site that hosts the app itself:

```text
Base directory: frontend
Build command: npm run build
Publish directory: dist
```

Set `VITE_API_URL` to the deployed FastAPI base URL for that application site.

!!! note "Docs and app are intentionally separate"
    The root Netlify config publishes MkDocs to `site/`. Do not repurpose it as the React app deployment by changing its publish directory to `frontend/dist`; that would collapse two different deployment concerns into one config.

---

## Failure triage cheatsheet

| Symptom | First checks |
| --- | --- |
| Web page unavailable | `docker compose ps`, web logs, frontend build/deploy status |
| API returns connection errors | `/health/live`, `/health/ready`, API logs, `DATABASE_URL` |
| API live but not ready | PostgreSQL health/logs, network/DNS between API and DB |
| Fresh DB has missing tables | Alembic `current`, then `upgrade head` |
| No study cards | run `python -m app.seed`, inspect seed output |
| Netlify docs deploy skipped | check whether docs-relevant paths actually changed |
| Docs build fails | run `mkdocs build --strict`; inspect TypeDoc/MkDocs import errors |
| Container image build fails | reproduce the failing Docker build and inspect the first failed layer |

---

## Operational principle

The safest recovery loop is:

**observe → narrow → mitigate → verify → prevent**

Restarting can be a mitigation, but it should not replace understanding the failure signal.

[Architecture decisions →](PLATFORM_ENGINEERING.md){ .md-button }
[Practice break/fix scenarios →](LABS.md){ .md-button .md-button--primary }
