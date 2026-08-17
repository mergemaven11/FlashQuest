# Platform Engineering curriculum 📚

FlashQuest’s ships with **144 concept cards** across **12 Platform Engineering domains**. Each domain contains 12 interview-style questions designed to build the vocabulary and mental models you need before tackling break/fix work.

The concepts are stored as versioned data in:

```text
backend/app/data/platform_engineering_cards.json
```

## Domain map

| Domain | Concept cards | What you practice |
| --- | ---: | --- |
| Linux & OS | 12 | processes, threads, load, file descriptors, systemd, `/proc`, OOM, namespaces |
| Networking | 12 | TCP/UDP, DNS, CIDR, routing, NAT, TLS, MTU, proxies, load balancing |
| Containers | 12 | images, layers, namespaces, cgroups, volumes, non-root execution, health checks |
| Kubernetes | 12 | Pods, Deployments, Services, probes, scheduling, ConfigMaps, Secrets, rollouts |
| CI/CD | 12 | pipelines, artifacts, caching, promotion, rollback, quality gates, credentials |
| Cloud | 12 | networking, IAM, availability, scaling, managed services, cost, workload identity |
| IaC & Terraform | 12 | state, plan/apply, drift, imports, backends, modules, lifecycle, safe change |
| Observability | 12 | metrics, logs, traces, SLOs, alerting, latency, cardinality, correlation |
| Databases | 12 | transactions, indexes, pooling, locks, backups, recovery, migrations |
| Security | 12 | least privilege, secrets, supply chain, vulnerabilities, identity, trust boundaries |
| SRE & Reliability | 12 | SLI/SLO/SLA, error budgets, retries, idempotency, graceful degradation |
| Incident Response | 12 | triage, mitigation, ownership, timelines, communications, postmortems |
| **Total** | **144** | **Platform Engineering foundations** |

## What a concept card looks like

Here are examples from the built-in curriculum:

=== "Linux"

    **Question:** What does load average represent?

    **Answer:** The average number of tasks that are runnable or waiting on uninterruptible I/O over 1, 5, and 15 minutes.

=== "Networking"

    **Question:** What is the difference between a Layer 4 and Layer 7 load balancer?

    **Answer:** Layer 4 balances using transport information such as IP and port. Layer 7 understands application protocols such as HTTP and can route using host, path, or headers.

=== "Containers"

    **Question:** Why use multi-stage Docker builds?

    **Answer:** They separate build-time tooling from the runtime image, reducing image size and attack surface.

!!! note "The goal is recall plus explanation"
    A strong answer should not stop at a definition. Try to explain **why the concept matters operationally**, what signal or failure it affects, and where you would use it in a real environment.

---

## Recommended study loop

1. **Reveal only after committing to an answer.** Say your answer out loud or write it down first.
2. **Mark the result accurately.** A miss returning sooner is useful training data, not a penalty.
3. **Connect concepts.** Ask yourself what breaks when the concept is misunderstood.
4. **Move into a lab.** After learning the concept, practice recognizing it from symptoms in the [Break/Fix Labs](LABS.md).
5. **Revisit the real app.** Use FlashQuest’s own architecture as a concrete example of readiness, migrations, containers, CI, and state boundaries.

## Mastery system

Cards move through **12 mastery bins (`0`–`11`)**. Higher bins wait longer before becoming due again.

| Bin | Approximate delay |
| --- | --- |
| 0 | new |
| 1 | 5 seconds |
| 2 | 30 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 6 hours |
| 7 | 1 day |
| 8 | 2 days |
| 9 | 4 days |
| 10 | 7 days |
| 11 | terminal mastery |

Correct answers advance mastery. Missed answers return sooner so weak material is practiced more frequently.

---

## Updating the curriculum

After changing either built-in curriculum data file, run:

```bash
docker compose exec api python -m app.seed
```

The seeder is idempotent: existing prompts are reused, new cards are inserted, and missing default-user progress rows are created without duplicating the deck.

Automated seed tests protect the expected deck size, unique prompts, domain balance, and repeat-seed behavior.

[Practice the concepts under pressure →](LABS.md){ .md-button .md-button--primary }
