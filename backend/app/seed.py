"""Seed the built-in Platform Engineering study deck.

Run with Docker:
    docker compose exec api python -m app.seed

The seed operation is idempotent: existing cards are reused and missing default-user
study state is repaired without duplicating content.
"""
from __future__ import annotations

from sqlmodel import Session, select

from .db import engine
from .models import Card, UserCard

PLATFORM_ENGINEERING_DECK_BY_DOMAIN: dict[str, list[tuple[str, str]]] = {
    "Linux & OS": [
        ("Linux · What is the difference between a process and a thread?", "A process has its own virtual address space and resources; threads share a process's address space and resources while scheduling independently."),
        ("Linux · What does load average represent?", "The average number of tasks that are runnable or waiting on uninterruptible I/O over 1, 5, and 15 minutes."),
        ("Linux · What is a file descriptor?", "A small integer handle a process uses to reference an open file, socket, pipe, device, or other kernel-managed I/O object."),
        ("Linux · What does `systemd` manage?", "Services and system state, including startup ordering, dependencies, timers, sockets, logging integration, and service supervision."),
        ("Linux · What is the purpose of `/proc`?", "A virtual filesystem exposing kernel and process information such as CPU, memory, mounts, and per-process state."),
        ("Linux · What is the difference between a hard link and a symbolic link?", "A hard link points to the same inode as the original file; a symbolic link stores a path that resolves to another file."),
        ("Linux · What does the OOM killer do?", "When memory is critically exhausted, the kernel selects and terminates one or more processes to recover memory."),
        ("Linux · What is swap used for?", "It provides disk-backed virtual memory that can hold less-active pages when RAM pressure is high, trading speed for capacity."),
        ("Linux · What does `nice` influence?", "A process's CPU scheduling priority; a higher nice value generally means lower priority."),
        ("Linux · Why use `journalctl`?", "To query and filter logs collected by systemd-journald, including logs by service, boot, priority, and time range."),
        ("Linux · What is an inode?", "Filesystem metadata describing an object, including ownership, permissions, timestamps, size, and pointers to data blocks."),
        ("Linux · What problem do namespaces solve?", "They isolate views of system resources such as processes, networking, mounts, users, and hostnames, forming a foundation for containers."),
    ],
    "Networking": [
        ("Networking · What happens during a TCP three-way handshake?", "The client sends SYN, the server responds SYN-ACK, and the client replies ACK to establish sequence numbers and the connection."),
        ("Networking · What is the difference between TCP and UDP?", "TCP is connection-oriented and reliable with ordering and retransmission; UDP is connectionless with lower overhead and no delivery guarantees."),
        ("Networking · What does DNS do?", "It maps names to records such as IP addresses, aliases, mail servers, and service metadata through a hierarchical distributed system."),
        ("Networking · What is CIDR notation?", "A way to describe IP networks using a prefix length, such as 10.0.0.0/24, which specifies how many leading bits identify the network."),
        ("Networking · What is a subnet?", "A logical subdivision of an IP network defined by a network prefix and used to group addresses and control routing boundaries."),
        ("Networking · What does a default gateway do?", "It is the router a host sends traffic to when the destination is outside its directly connected networks."),
        ("Networking · What is NAT?", "Network Address Translation rewrites source or destination IP addresses and often ports, commonly allowing private addresses to share public connectivity."),
        ("Networking · What is the difference between a Layer 4 and Layer 7 load balancer?", "Layer 4 balances using transport information like IP and port; Layer 7 understands application protocols such as HTTP and can route by host, path, or headers."),
        ("Networking · What does TLS provide?", "Encryption, integrity, and peer authentication for network traffic, usually through certificates and negotiated session keys."),
        ("Networking · What is MTU?", "Maximum Transmission Unit: the largest packet payload a network link can carry without fragmentation at that layer."),
        ("Networking · Why does connection pooling matter?", "It reuses established connections, reducing handshake overhead and resource churn for repeated backend or database requests."),
        ("Networking · What is the purpose of a reverse proxy?", "It accepts client requests on behalf of backend services and can provide routing, TLS termination, caching, authentication, and load balancing."),
    ],
    "Containers": [
        ("Containers · What is the difference between an image and a container?", "An image is an immutable filesystem and metadata template; a container is a running or stopped instance created from an image."),
        ("Containers · Why are image layers useful?", "Layers are content-addressed and reusable, allowing efficient caching, distribution, and incremental image builds."),
        ("Containers · What does a container namespace isolate?", "Depending on namespace type, it can isolate processes, networking, mounts, users, IPC, or hostnames from the host and other containers."),
        ("Containers · What do cgroups control?", "They account for and limit resource usage such as CPU, memory, I/O, and process counts for groups of processes."),
        ("Containers · Why use multi-stage Docker builds?", "They separate build-time tooling from the runtime image, reducing image size and attack surface."),
        ("Containers · Why run containers as non-root?", "It limits the impact of a container compromise and follows least-privilege principles."),
        ("Containers · What is a Docker volume?", "Persistent storage managed outside a container's writable layer so data can survive container replacement."),
        ("Containers · What does a health check do?", "It periodically tests whether a containerized process is healthy or ready according to a command or endpoint."),
        ("Containers · Why pin base image versions or digests?", "To improve reproducibility and reduce surprise changes from mutable tags."),
        ("Containers · What is the container writable layer?", "The ephemeral filesystem layer on top of image layers where runtime file changes are stored unless a volume or bind mount is used."),
        ("Containers · Why keep `.dockerignore` small but intentional?", "It prevents unnecessary files, secrets, caches, and build artifacts from entering the build context, improving speed and reducing risk."),
        ("Containers · What is the difference between `ENTRYPOINT` and `CMD`?", "`ENTRYPOINT` defines the executable a container runs; `CMD` commonly supplies default arguments that can be overridden at runtime."),
    ],
    "Kubernetes": [
        ("Kubernetes · What is a Pod?", "The smallest schedulable Kubernetes unit, containing one or more containers that share networking and certain storage resources."),
        ("Kubernetes · What does a Deployment manage?", "It declaratively manages ReplicaSets and rolling updates for stateless application Pods."),
        ("Kubernetes · What is a Service?", "A stable virtual network endpoint that selects Pods and provides service discovery and load balancing inside or outside the cluster."),
        ("Kubernetes · What is the difference between liveness and readiness probes?", "Liveness asks whether a container should be restarted; readiness asks whether it should receive traffic."),
        ("Kubernetes · What does the scheduler do?", "It assigns unscheduled Pods to nodes based on resource requests, constraints, affinity, taints, topology, and other policies."),
        ("Kubernetes · What are resource requests and limits?", "Requests influence scheduling and reserved capacity; limits cap how much CPU or memory a container may use."),
        ("Kubernetes · What is a ConfigMap?", "A Kubernetes object for non-secret configuration data that can be injected into Pods as environment variables or files."),
        ("Kubernetes · What is a Secret?", "A Kubernetes object for sensitive configuration such as tokens or passwords; it still requires proper encryption and access controls to be secure."),
        ("Kubernetes · What does an Ingress do?", "It defines HTTP/HTTPS routing rules into cluster Services, implemented by an ingress controller."),
        ("Kubernetes · What are taints and tolerations?", "Taints repel Pods from nodes; tolerations allow matching Pods to be scheduled onto tainted nodes."),
        ("Kubernetes · What is a StatefulSet?", "A controller for workloads needing stable identities, ordered rollout, and often persistent per-Pod storage."),
        ("Kubernetes · What is a PodDisruptionBudget?", "It limits voluntary disruptions so a minimum number or percentage of application replicas remain available during operations like node drains."),
    ],
    "CI/CD": [
        ("CI/CD · What is continuous integration?", "Frequently merging changes into a shared branch with automated build, test, and quality checks."),
        ("CI/CD · What is continuous delivery?", "Keeping software in a deployable state so production releases can be performed reliably, often with a manual approval step."),
        ("CI/CD · What is continuous deployment?", "Automatically releasing every change that passes the required pipeline gates to production."),
        ("CI/CD · Why should pipelines fail fast?", "Early failure saves compute time and gives developers faster feedback before expensive later stages run."),
        ("CI/CD · What is an immutable artifact?", "A build output that is created once and promoted unchanged across environments, improving traceability and consistency."),
        ("CI/CD · Why separate build from deploy?", "It allows the same verified artifact to be promoted across environments and reduces environment-specific rebuild drift."),
        ("CI/CD · What is a deployment gate?", "A policy or approval condition that must pass before a release advances, such as tests, security checks, SLO signals, or human approval."),
        ("CI/CD · What is a canary deployment?", "A rollout strategy that sends a small portion of traffic to a new version first, expanding only if health signals remain acceptable."),
        ("CI/CD · What is blue-green deployment?", "Two production environments are maintained; traffic switches from the old environment to the new one after validation."),
        ("CI/CD · Why cache dependencies in CI?", "To reduce repeated download/build work and shorten pipeline duration while preserving correct cache keys and invalidation."),
        ("CI/CD · What is pipeline idempotency?", "Running the same pipeline step repeatedly produces the same intended state without unintended duplicate side effects."),
        ("CI/CD · Why record artifact provenance?", "It links an artifact to its source, build process, dependencies, and identity, supporting traceability and software supply-chain security."),
    ],
    "Cloud": [
        ("Cloud · What is the shared responsibility model?", "The provider secures the cloud infrastructure, while customers remain responsible for their data, identities, configuration, and workloads to varying degrees."),
        ("Cloud · What is horizontal scaling?", "Adding more instances or replicas to handle load rather than increasing the resources of one instance."),
        ("Cloud · What is vertical scaling?", "Increasing CPU, memory, or other resources on an existing instance."),
        ("Cloud · What is an availability zone?", "A physically separate failure domain within a cloud region, designed to isolate power, cooling, and other infrastructure failures."),
        ("Cloud · Why deploy across multiple availability zones?", "To reduce the chance that a single datacenter-level failure makes the service unavailable."),
        ("Cloud · What is object storage best suited for?", "Durable storage of blobs and files addressed as objects, such as backups, media, logs, and build artifacts."),
        ("Cloud · What is an IAM role?", "An identity with a set of permissions that can be assumed by users, workloads, or services without embedding long-lived credentials."),
        ("Cloud · What is autoscaling?", "Automatically adjusting capacity based on metrics, schedules, or demand to balance performance and cost."),
        ("Cloud · What is a managed service?", "A service where the cloud provider operates more of the underlying infrastructure and maintenance, such as patching or replication."),
        ("Cloud · What is an egress cost?", "A charge for data transferred out of a cloud provider, region, or service boundary depending on the provider's pricing model."),
        ("Cloud · Why tag cloud resources?", "Tags support ownership, cost allocation, inventory, policy enforcement, automation, and lifecycle management."),
        ("Cloud · What is a cloud landing zone?", "A standardized, governed cloud foundation defining accounts/projects, networking, identity, logging, security, and policy for teams to build on."),
    ],
    "IaC & Terraform": [
        ("IaC · What is Infrastructure as Code?", "Managing infrastructure through versioned declarative or programmatic definitions rather than manual console changes."),
        ("Terraform · What is state?", "Terraform's record of managed resource identities and known attributes, used to compare configuration with real infrastructure."),
        ("Terraform · Why use remote state?", "It centralizes state for teams and can add locking, encryption, backups, and controlled access."),
        ("Terraform · What does `terraform plan` show?", "The proposed changes Terraform would make to reconcile configured desired state with current known infrastructure."),
        ("Terraform · What does drift mean?", "Real infrastructure has changed outside the expected IaC workflow, causing it to differ from declared configuration or recorded state."),
        ("Terraform · What is a provider?", "A plugin that lets Terraform interact with a specific API or service and exposes resource and data-source types."),
        ("Terraform · What is a module?", "A reusable collection of Terraform resources with inputs and outputs that encapsulates a repeatable infrastructure pattern."),
        ("Terraform · Why pin provider versions?", "To prevent unexpected behavior from automatic upgrades and keep runs reproducible."),
        ("Terraform · What is state locking?", "A mechanism that prevents concurrent Terraform operations from modifying the same state at the same time."),
        ("IaC · Why review plans in pull requests?", "It makes intended infrastructure changes visible before apply, supporting peer review, policy checks, and safer change control."),
        ("IaC · What is policy as code?", "Machine-enforced rules that evaluate infrastructure or deployment configuration, such as requiring encryption, tags, or approved regions."),
        ("IaC · Why avoid secrets in Terraform state?", "State may persist sensitive values and be broadly accessible; secrets should be minimized, protected, and preferably referenced from dedicated secret systems."),
    ],
    "Observability": [
        ("Observability · What are the three common telemetry signals?", "Metrics, logs, and traces."),
        ("Observability · What is a metric?", "A numeric measurement over time, typically labeled by dimensions, used for trends, alerts, capacity, and health analysis."),
        ("Observability · What is structured logging?", "Emitting logs as machine-parseable fields, often JSON, so they can be reliably queried and correlated."),
        ("Observability · What is distributed tracing?", "Tracking a request across service boundaries using linked spans to understand latency and dependencies."),
        ("Observability · What is high-cardinality telemetry?", "Telemetry with labels or attributes that can take many unique values, such as user IDs, which can greatly increase storage and query cost."),
        ("Observability · What is an SLI?", "A Service Level Indicator is a measured signal of service behavior, such as successful request rate or latency."),
        ("Observability · What is an SLO?", "A Service Level Objective is a target for an SLI over a time window, such as 99.9% successful requests over 30 days."),
        ("Observability · What is an error budget?", "The allowed amount of unreliability implied by an SLO, used to balance feature velocity against reliability work."),
        ("Observability · What is a RED dashboard?", "A service-focused view of Rate, Errors, and Duration."),
        ("Observability · What is a USE dashboard?", "A resource-focused view of Utilization, Saturation, and Errors."),
        ("Observability · Why propagate request IDs?", "They let operators correlate logs and events belonging to the same request across services and proxies."),
        ("Observability · What makes an alert actionable?", "It indicates a meaningful user or system impact, has a clear owner, and provides enough context or runbook guidance for a response."),
    ],
    "Databases": [
        ("Databases · What is an ACID transaction?", "A transaction with Atomicity, Consistency, Isolation, and Durability guarantees."),
        ("Databases · What is an index?", "A data structure that speeds lookups and ordering at the cost of storage and additional write overhead."),
        ("Databases · What is a primary key?", "A column or set of columns that uniquely identifies each row in a table."),
        ("Databases · What is a foreign key?", "A constraint linking values in one table to a key in another, helping maintain referential integrity."),
        ("Databases · What is a database migration?", "A versioned change to database schema or data that can be applied in a controlled, repeatable sequence."),
        ("Databases · Why are connection pools used?", "They reuse database connections, avoiding expensive setup per request and controlling concurrent database load."),
        ("Databases · What is replication?", "Maintaining copies of data on multiple database nodes for availability, read scaling, disaster recovery, or locality."),
        ("Databases · What is the difference between a read replica and a primary?", "The primary accepts authoritative writes; read replicas copy changes and are typically used to scale reads or improve resilience."),
        ("Databases · What is transaction isolation?", "Rules controlling how concurrent transactions can observe each other's intermediate or committed changes."),
        ("Databases · What is a deadlock?", "Two or more transactions wait on locks held by each other, forming a cycle that the database must detect and break."),
        ("Databases · Why test migrations on a clean database in CI?", "It verifies the full migration chain can build the schema from scratch, catching ordering or dependency problems before deployment."),
        ("Databases · What is point-in-time recovery?", "Restoring a database to a specific moment using backups plus transaction or write-ahead logs."),
    ],
    "Security": [
        ("Security · What is least privilege?", "Granting identities only the permissions needed for their current responsibilities and no more."),
        ("Security · What is secret rotation?", "Replacing credentials or cryptographic secrets on a regular or event-driven basis while minimizing service disruption."),
        ("Security · Why avoid long-lived cloud access keys?", "They are harder to rotate and more damaging if leaked; short-lived workload identities reduce exposure."),
        ("Security · What is RBAC?", "Role-Based Access Control assigns permissions to roles and then maps users or workloads to those roles."),
        ("Security · What is a software supply-chain attack?", "Compromising dependencies, build systems, artifact repositories, or release processes to inject malicious software."),
        ("Security · What is an SBOM?", "A Software Bill of Materials inventories software components and dependencies contained in an artifact."),
        ("Security · Why scan container images?", "To identify known vulnerabilities, risky packages, secrets, and policy violations before deployment."),
        ("Security · What is defense in depth?", "Using multiple independent security controls so one control's failure does not expose the entire system."),
        ("Security · What is TLS certificate rotation?", "Replacing expiring or compromised certificates and keys while preserving trusted encrypted service communication."),
        ("Security · What is network segmentation?", "Dividing networks into controlled zones to limit lateral movement and restrict which systems can communicate."),
        ("Security · Why validate input at service boundaries?", "To reject malformed or unsafe data before it reaches deeper components, reducing exploitability and data integrity problems."),
        ("Security · What does zero trust mean?", "Do not grant implicit trust based on network location; continuously verify identity, device/workload context, and authorization for each access."),
    ],
    "SRE & Reliability": [
        ("SRE · What is toil?", "Manual, repetitive, automatable operational work that scales linearly with service growth and provides little enduring value."),
        ("SRE · What is mean time to recovery (MTTR)?", "The average time required to restore service after a failure or incident."),
        ("SRE · What is a graceful degradation strategy?", "Maintaining reduced but useful functionality when dependencies fail instead of causing a total outage."),
        ("SRE · What is fault tolerance?", "The ability of a system to continue operating correctly, possibly at reduced capacity, when components fail."),
        ("SRE · What is redundancy?", "Providing multiple components or paths so a single failure does not remove the required capability."),
        ("SRE · What is a single point of failure?", "A component whose failure can make the entire service or critical capability unavailable."),
        ("SRE · Why use timeouts on network calls?", "They bound how long a caller waits on an unhealthy dependency and help prevent resource exhaustion and cascading failures."),
        ("SRE · What is a retry storm?", "Excessive synchronized retries that amplify load on an already unhealthy dependency and can worsen an outage."),
        ("SRE · What is exponential backoff with jitter?", "A retry strategy that increases delay between attempts and adds randomness to avoid synchronized retry spikes."),
        ("SRE · What is a circuit breaker?", "A pattern that temporarily stops calls to a failing dependency after a threshold, allowing recovery and preventing repeated expensive failures."),
        ("SRE · What is capacity planning?", "Forecasting resource needs based on traffic, growth, performance characteristics, failure headroom, and business requirements."),
        ("SRE · Why perform game days or chaos experiments?", "To validate resilience assumptions, practice response, and discover failure modes before real incidents expose them."),
    ],
    "Incident Response": [
        ("Incidents · What is incident triage?", "Rapidly assessing impact, scope, severity, and likely ownership so the right responders and actions are engaged."),
        ("Incidents · What is the role of an incident commander?", "To coordinate response, set priorities, delegate work, and maintain a shared operational picture rather than debugging everything personally."),
        ("Incidents · What is mitigation?", "An action that reduces user impact quickly, even if it does not fix the underlying root cause."),
        ("Incidents · What is root cause analysis?", "A structured investigation into the technical and systemic contributors that allowed an incident to happen."),
        ("Incidents · What is a blameless postmortem?", "A review focused on learning from system conditions and decisions rather than punishing individuals for reasonable actions."),
        ("Incidents · Why keep an incident timeline?", "It preserves a factual sequence of symptoms, decisions, changes, and outcomes for coordination and later analysis."),
        ("Incidents · What is rollback?", "Returning to a previously known-good application or configuration version to reduce impact from a bad change."),
        ("Incidents · What is a runbook?", "A documented operational procedure for diagnosing or responding to a known condition or routine task."),
        ("Incidents · What is escalation?", "Bringing in additional expertise, authority, or resources when impact or uncertainty exceeds the current response team's capability."),
        ("Incidents · Why separate status communication from debugging?", "It keeps stakeholders informed without distracting every technical responder and provides consistent updates."),
        ("Incidents · What is change correlation?", "Checking whether recent deployments, configuration changes, traffic shifts, or dependency changes align with incident onset."),
        ("Incidents · What should a good postmortem produce?", "Concrete lessons and prioritized follow-up actions that reduce recurrence, improve detection, or make future recovery faster."),
    ],
}

PLATFORM_ENGINEERING_DECK: list[tuple[str, str]] = [
    card
    for cards in PLATFORM_ENGINEERING_DECK_BY_DOMAIN.values()
    for card in cards
]


def seed_platform_deck(session: Session) -> dict[str, int]:
    """Insert the Platform Engineering deck and default-user study state."""
    existing_cards = {card.word: card for card in session.exec(select(Card)).all()}
    existing_progress_ids = set(
        session.exec(select(UserCard.card_id).where(UserCard.user_id == 1)).all()
    )

    inserted_cards = 0
    existing_count = 0
    created_progress = 0

    for prompt, answer in PLATFORM_ENGINEERING_DECK:
        card = existing_cards.get(prompt)
        if card is None:
            card = Card(word=prompt, definition=answer)
            session.add(card)
            session.flush()
            existing_cards[prompt] = card
            inserted_cards += 1
        else:
            existing_count += 1

        if card.id is not None and card.id not in existing_progress_ids:
            session.add(UserCard(card_id=card.id, user_id=1, bin=0))
            existing_progress_ids.add(card.id)
            created_progress += 1

    session.commit()
    return {
        "deck_size": len(PLATFORM_ENGINEERING_DECK),
        "inserted_cards": inserted_cards,
        "existing_cards": existing_count,
        "created_progress": created_progress,
    }


def run() -> None:
    """Seed the configured database and print a compact result summary."""
    with Session(engine) as session:
        result = seed_platform_deck(session)

    print(
        "FlashQuest Platform Engineering deck ready: "
        f"{result['deck_size']} cards "
        f"({result['inserted_cards']} inserted, "
        f"{result['existing_cards']} already present, "
        f"{result['created_progress']} progress rows created)."
    )


if __name__ == "__main__":
    run()
