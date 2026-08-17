# Break/Fix labs 🧪🔧

FlashQuest’s includes **72 practical Platform Engineering lab cards** — **6 scenarios in each of the 12 curriculum domains**.

These are not definition questions. They put you in the middle of a broken or risky system and ask you to choose a troubleshooting path, identify the right signals, and recover safely.

The lab deck is versioned in:

```text
backend/app/data/platform_engineering_labs.json
```

## How to answer a lab

Use this five-part mental model:

1. **Confirm impact** — what is actually broken, who is affected, and how urgent is it?
2. **Collect signals** — logs, events, health checks, metrics, network tests, plans, or database state.
3. **Narrow the failure domain** — application, host, network, dependency, configuration, deployment, or infrastructure.
4. **Mitigate safely** — restore service without making the failure harder to understand or recover from.
5. **Verify and prevent** — prove the fix worked, then improve automation, tests, monitoring, or documentation.

!!! tip "Interview mode"
    Before revealing the answer, talk through **what you would check first and why**. Platform interviews often care as much about prioritization and safety as the final command.

---

## Example labs

=== "Linux"

    **Scenario:** A service works manually but fails after reboot. What do you check and fix?

    **Strong path:**

    - inspect `systemctl status` and `journalctl -u`;
    - verify the unit is enabled;
    - check absolute paths and boot-time environment differences;
    - inspect service dependencies and ordering;
    - `daemon-reload`, enable, restart, and verify.

=== "Networking"

    **Scenario:** DNS fails but the service works by IP. What do you check?

    **Strong path:**

    - inspect resolver configuration;
    - compare `dig` / `nslookup` results;
    - verify authoritative records and TTL/cache behavior;
    - confirm the client uses the expected DNS server;
    - compare A and AAAA answers from the failing network context.

=== "Containers"

    **Scenario:** A container can write as root but fails as a non-root user. Fix it.

    **Strong path:**

    - create a dedicated UID/GID;
    - own only the required runtime directories;
    - keep mutable data on writable mounted paths;
    - avoid privileged ports when possible;
    - keep the final image `USER` non-root.

=== "Kubernetes"

    **Scenario:** A Service has no traffic even though Pods are Running.

    **Strong path:**

    - compare Service selectors with Pod labels;
    - inspect Endpoints / EndpointSlices;
    - verify `targetPort` and container ports;
    - test the Pod IP directly;
    - inspect readiness probes and NetworkPolicies.

=== "CI/CD"

    **Scenario:** Tests pass locally but fail in CI.

    **Strong path:** compare runtime versions, dependency locks, environment variables, working directory, filesystem case sensitivity, timezone/locale, service dependencies, and hidden local state. Reproduce in the same runner/container when possible.

=== "Terraform"

    **Scenario:** `terraform plan` wants to recreate a critical database unexpectedly.

    **Strong path:** **do not apply**. Identify the `ForceNew` change, compare state/config/provider versions, inspect imports/address moves and lifecycle behavior, and protect the resource while you repair the model.

---

## Lab map

| Domain | Example failure modes |
| --- | --- |
| Linux & OS | boot failures, hidden disk usage, high load, file descriptor exhaustion, OOM kills |
| Networking | DNS, TCP timeouts, TLS/public exposure, 502s, MTU, latency decomposition |
| Containers | exit loops, oversized images, permissions, service DNS, persistence, health checks |
| Kubernetes | CrashLoopBackOff, no endpoints, stuck rollouts, Pending Pods, stale config, probes |
| CI/CD | local-vs-CI drift, slow pipelines, mutable artifacts, rollback, leaked secrets |
| Cloud | private egress, accidental exposure, autoscaling, AZ resilience, cost spikes, OIDC |
| IaC & Terraform | destructive plans, locking, imports, drift, state/secrets, module design |
| Observability | latency, noisy alerts, tracing gaps, SLOs, high-cardinality telemetry |
| Databases | connection exhaustion, slow queries, migrations, deadlocks, recovery |
| Security | CVEs, credential exposure, IAM excess, secret handling, supply chain |
| SRE & Reliability | retries, idempotency, degradation, circuit breakers, chaos testing |
| Incident Response | triage, mitigation, command, rollback, communications, postmortems |

---

## Build a real practice environment

The cards are useful by themselves, but the best version of this project is to **reproduce selected failures locally**.

For example:

```bash
# Start the stack
docker compose up --build -d

# Verify the happy path
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready

# Inspect container state
docker compose ps

docker compose logs api
```

Then intentionally introduce a safe local failure — wrong environment value, unavailable dependency, bad port, or unhealthy configuration — and work through the diagnosis.

!!! warning "Keep destructive practice local"
    Do break/fix experiments in disposable local environments or dedicated sandboxes. Do not practice destructive recovery steps against systems or data you cannot safely replace.

---

## What a strong lab answer sounds like

Instead of:

> “Restart it.”

Aim for:

> “I’d first confirm the scope and inspect the most direct health signal. Then I’d compare recent changes and dependency state, narrow the failure domain, choose the lowest-risk mitigation, and verify the service from the user-facing path. After recovery I’d capture the root cause and add a guardrail so the same failure is easier to detect or prevent.”

That is the troubleshooting muscle FlashQuest’s is designed to build.

[Review the concepts →](CURRICULUM.md){ .md-button }
[See how FlashQuest’s itself is operated →](OPERATIONS.md){ .md-button .md-button--primary }
