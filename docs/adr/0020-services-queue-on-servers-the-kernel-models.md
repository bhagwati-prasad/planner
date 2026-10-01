# 0020 Services queue on servers the kernel models

Status: Accepted
Date: 2026-09-30

## Context and problem

Spec §11 "Routing and resources" says services are multi-server queues: instances × concurrency servers, a bounded backlog, and timeouts. Task 0409's first test is "a service with 2 instances × 4 concurrency queues the ninth concurrent request". Behaviour code cannot do this. A method answers when it returns, or when a `ctx.send` it awaits is answered (spec §8), so nothing a component writes can make a request wait for a free server. The function's concurrency limit and the load balancer's connection limit are the same kind of resource. Either the kernel models servers, or the behaviour API gains a way to wait for one. Both change kernel semantics or the plugin API (CLAUDE.md, "Ask the human first").

## Decision drivers

- Follow spec §11: queueing shows up in latency, and a full backlog refuses work.
- Keep simulation fast and deterministic: a request that waits is an event in the queue, not a busy loop.
- Built-in components use only the public plugin API (eng §10), and user components extending `base:service` should queue the same way.
- Components must stay testable in their own `tests/`.

## Considered options

1. **Servers in the kernel, declared by base behaviours.** A base behaviour (strata-sim, as decided for 0407) names the properties that give its servers and backlog. `base:service` would take `instances × concurrency` servers, a backlog of `maxBacklog` and a timeout of `timeout`. The run admits each public call to a free server, queues it first in, first out when all are busy, and refuses it with `BACKLOG_FULL` when the backlog is full. The span starts when the call arrives and records how long it queued. A call releases its server when it answers. A component's manifest can give other property names under a new optional `servers` field, for example the function's `maxConcurrency` with no backlog, which throttles. `strata/testing` gains `runComponent({ manifest, behaviour, props })`, which runs one component in the kernel, so self-tests can check queueing.
2. **A ctx promise for a server.** `await ctx.acquire(limit, { backlog })` resolves when fewer than `limit` of the node's calls hold a server, and the method releases it when it answers. Behaviour code decides its own limits. It is more flexible, but every component must remember to acquire, and the plugin API grows by one member.
3. **Servers only as a cost estimate.** Components compute an expected queueing delay (M/M/c) from their load and add it as latency, and nothing waits. This needs no new semantics, but "queues the ninth concurrent request" cannot be observed, and results would not show real queueing.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-30, together with splitting task 0409 into 0409 (service), 0419 (serverless function) and 0420 (load balancer and API gateway). Queueing is the kernel's, as spec §11 puts it, so every service-like component queues the same way without code, and queueing shows in the trace and the metrics.

## Consequences

- Good: every service-like component queues the same way, with no code, as spec §11 describes, and custom components that extend `base:service` inherit it.
- Good: queueing is visible in the trace (time queued) and in metrics (backlog, utilisation).
- Bad: a new optional `servers` field in manifests (a plugin API addition) and a new kernel mechanism, with its own error code.
- Bad: `strata/testing` grows by `runComponent`, which runs strata-sim in Node for `strata test-component`.
- Follow-up tasks: 0409 uses it for the service, the function and the load balancer. 0413's snapshots must capture queued calls.

## Implementation notes (task 0409)

- `count` multiplies its entries. A node lacking one of them, such as a `base:service` that sets no `concurrency`, has no limit, so it runs every call at once and records no server metrics.
- A count may name a state field, so autoscaling can change it. A count that grows admits waiting calls when a server is released, or when any call or timer of the node ends, whichever comes first. The starter service's autoscale timer relies on this.
- The serverless function (task 0419) does not use servers, though option 1 names it as an example. As the human decided on 2026-10-01, it throttles in its own code: with no backlog the kernel would refuse before the behaviour runs, so the function could neither answer `THROTTLED` nor report `throttles`.
- `BACKLOG_FULL` and `TIMEOUT` are the codes a caller sees, as for a component's own `ctx.fail`. The manifest check reports a malformed `servers` field with `E_MANIFEST_SERVERS`, and warns when it names a property the manifest does not declare but its base type may.
