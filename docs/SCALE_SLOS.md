# FlashQuest Scale SLOs and Validation Contract

FlashQuest should make **measured claims**, not architecture-by-adjective claims.

This document defines the service-level objectives (SLOs), saturation signals, validation tiers, and reporting format used by the scale program in issue #46.

## Claim rules

Public wording must distinguish three different things:

1. **Architecture capability** — a design is implemented, such as multi-instance realtime pub/sub.
2. **Load-test validation** — a repeatable benchmark passed at a measured concurrency/throughput target.
3. **Observed production traffic** — real production telemetry saw that load.

Do not convert one category into another.

Examples:

- Good: `Quest Rooms support multi-instance realtime fan-out through a shared event bus.`
- Good: `Validated in a 60-minute test at 10,000 concurrent WebSocket connections with p95 fan-out under 250 ms.`
- Good: `Production p95 for /study/next over the last 7 days was 180 ms.`
- Not acceptable: `FlashQuest serves millions of users` unless production telemetry actually proves that statement.
- Not acceptable: `Hyperscale` as a standalone claim without a published test environment and measured result.

Until the scale program is complete, prefer **production-minded**, **horizontally scalable**, or **scale-tested to X** over `hyperscale`.

## Core HTTP SLOs

These are initial targets for a healthy same-region deployment. Load-test thresholds may be tightened after baseline measurements.

| Path class | p95 target | p99 target | Error target |
| --- | ---: | ---: | ---: |
| Health/readiness | 100 ms | 250 ms | < 0.1% |
| Public Library/deck reads | 250 ms | 500 ms | < 0.5% |
| Study next/answer | 400 ms | 800 ms | < 0.5% |
| Authenticated deck/card writes | 500 ms | 1,000 ms | < 1.0% |
| Room REST operations | 400 ms | 800 ms | < 0.5% |
| WebSocket ticket issuance | 250 ms | 500 ms | < 0.5% |

Expected validation errors such as 401/403/404 from deliberately invalid test traffic do not count toward service-error SLOs. Unexpected 5xx responses, connection failures, and timeouts do.

## Realtime SLOs

For Quest Rooms, measure events from **server acceptance to receipt by an eligible connected participant**.

| Signal | Target |
| --- | ---: |
| p95 room-event fan-out | < 250 ms |
| p99 room-event fan-out | < 750 ms |
| p95 reconnect to usable room snapshot | < 3 s |
| Lost accepted durable chat messages | 0 |
| Duplicate durable chat messages | 0 |
| Pre-reveal answer leakage | 0 |
| Unauthorized cross-room delivery | 0 |

A room event that was rejected by authorization/rate limiting is not considered an accepted event.

## Saturation guardrails

A test can hit latency targets and still be unhealthy if it is one request away from collapse. Record saturation with every serious benchmark.

Initial guardrails:

- PostgreSQL connection-pool utilization should remain below 80% at steady state.
- Application memory should plateau during steady-state/soak phases; unexplained monotonic growth is a failure.
- Realtime outbound queues must be bounded.
- Event-loop/runtime lag must remain within the realtime latency budget.
- CPU saturation above 90% for sustained steady state requires an explicit note even if latency passes.
- HTTP timeout rate must remain below 0.1%.
- WebSocket unexpected disconnect rate must remain below 0.5% during steady state.
- Reconnect storms must use bounded retry/backoff rather than immediate unbounded loops.

## Validation ladder

These are **targets to attempt**, not claims FlashQuest has already achieved.

### Tier 0 — Smoke

Purpose: catch obvious performance-contract regressions cheaply.

- 50 HTTP requests/second
- 100 concurrent WebSocket connections
- 50 realtime room events/second
- 10 minute run

Expected use: local development and lightweight performance smoke checks.

### Tier 1 — Portfolio-scale validation

- 250 HTTP requests/second
- 1,000 concurrent WebSocket connections
- 500 realtime room events/second
- 30 minute steady-state run
- at least two application instances for realtime tests after #48

Passing Tier 1 allows wording such as:

> Load-tested at 1,000 concurrent realtime clients and 250 HTTP requests/second under the documented test environment.

### Tier 2 — Scale validation

- 1,000 HTTP requests/second
- 10,000 concurrent WebSocket connections
- 5,000 realtime room events/second
- 60 minute steady-state run
- multi-instance application topology
- PostgreSQL pool/query saturation captured
- shared realtime bus metrics captured

Passing Tier 2 allows wording such as:

> Horizontally scaled and load-tested to 10,000 concurrent realtime clients, with published latency/error measurements.

It still does **not** justify saying that production regularly serves 10,000 concurrent users.

### Tier 3 — Stretch validation

- 5,000 HTTP requests/second
- 50,000 concurrent WebSocket connections
- 20,000 realtime room events/second
- 4 hour soak
- rolling instance restart during load
- dependency-failure/recovery scenario during the run

Tier 3 is intentionally a stretch target. Infrastructure cost and load-generator capacity must be recorded. Do not spend money merely to obtain a vanity benchmark.

## Scenario mix

HTTP benchmarks should use a representative mix rather than hammering only `/health`:

- 25% Library/deck reads
- 25% Study next/answer
- 15% auth/session reads
- 10% deck/card creator reads/writes
- 10% Arcade start/state/events
- 10% Quest Room REST operations
- 5% health/readiness

Realtime benchmarks should include:

- connect + ticket consumption
- presence joins/leaves
- persistent chat messages
- room snapshots/reconnect
- at least one synchronized Arcade activity
- host moderation/removal event

The exact mix may evolve; every report must record the mix used.

## Soak-test pass conditions

A soak test passes only when all of these remain true through the steady-state window:

- latency and error SLOs remain inside the selected tier threshold;
- no durable data corruption or duplicate accepted writes;
- no unauthorized realtime delivery;
- no answer-key leakage before synchronized reveal;
- memory reaches a stable plateau rather than growing with completed sessions/connections;
- connection/session cleanup keeps bounded ephemeral state bounded;
- PostgreSQL connections return to the pool normally;
- after ramp-down, open sockets and ephemeral session counts return near baseline.

## Failure-test expectations

Scale validation should eventually exercise:

- one app instance terminated during active rooms;
- rolling deploy/drain during connected WebSockets;
- shared pub/sub interruption and recovery;
- PostgreSQL latency spike / temporary unavailability;
- reconnect storm;
- burst traffic above intended capacity;
- a single noisy room producing disproportionate event volume.

The expected behavior is **bounded degradation**, not magical zero impact.

## Benchmark report template

Every published result must include:

```text
FlashQuest scale validation
Date:
Git SHA:
Test tier:
Duration:

Application topology:
- app instances:
- CPU/RAM per instance:
- region(s):
- Python/runtime configuration:

Data dependencies:
- PostgreSQL topology/size:
- shared pub/sub topology/size:

Dataset:
- users:
- decks/cards:
- rooms:
- historical messages:

Load:
- HTTP RPS:
- concurrent WebSockets:
- realtime events/sec:
- scenario mix:

Results:
- HTTP p50/p95/p99:
- realtime fan-out p50/p95/p99:
- error rate:
- unexpected disconnect rate:
- reconnect p95:
- DB pool peak:
- CPU peak/steady:
- memory start/steady/end:

Failures/anomalies:

Pass/fail against this document:
```

## Portfolio wording after validation

Use evidence-first statements:

> Designed and implemented a horizontally scalable realtime study platform using FastAPI, PostgreSQL, WebSockets, and shared pub/sub; built reproducible load/soak tests and validated the system at **X concurrent clients / Y RPS** with **p95 Z ms** under a documented multi-instance test environment.

That is a stronger engineering claim than `built a hyperscale app` because the numbers can be inspected and reproduced.
