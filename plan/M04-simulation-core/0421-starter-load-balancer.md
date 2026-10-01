# 0421 Starter library: load balancer

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0420](../M04-simulation-core/0420-starter-gateway.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [ADR 0019 Messages carry protocol details, and edges route by rules](../../docs/adr/0019-messages-carry-protocol-details-and-edges-route-by-rules.md)

## Goal

The load balancer, complete per spec §9: its layer, algorithms (round-robin, least connections, weighted, IP hash, consistent hash), health checks with their thresholds, maximum connections, idle timeout, sticky sessions and TLS termination. Behaviour code gains a way to see the edges leaving a port and to send over a chosen one (ADR 0022).

## Tests to write first

Write these tests first, in `components/load-balancer/tests` and `packages/sim/test`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] `ctx.targets(port)` lists the edges leaving a port in a stable order, and `ctx.send(port, method, args, { edge })` sends over the edge it names
- [x] The load balancer spreads requests round-robin across its targets, and stops sending to one that fails its unhealthy threshold of health checks

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0420 on 2026-10-01, as the human decided. The human also chose ADR 0022's `ctx.targets(port)` and the `edge` send option, so the load balancer picks its targets itself.
- It depends on 0420 only for its order in the plan: 0420 brings `Promise.race`, which its health checks use for their timeout.
- **Done (2026-10-01).** The tests are in `packages/sim/test/targets.test.js`, `components/load-balancer/tests/load-balancer.test.js`, and `component.test.js` and `testing.test.js` for the helpers. Beyond the listed ones, they cover least connections, weights, IP and consistent hashing, stickiness at layer 7 and layer 4, maximum connections, no healthy target, failing targets, and that every method, error and metric is exercised.
- **ADR 0022.**
  - `ctx.targets(port)` and the `edge` send option are in the kernel.
  - `createTestContext` takes `targets`.
  - `runComponent` puts one stub per name behind a port with `targets`, and its edges take `edges['port:name']`.
- **Limits.**
  - The client's address comes from an `x-forwarded-for` header.
  - Sticky sessions and layer-4 connections both expire after `idleTimeout`.
  - A health check waits at most the interval.
  - A target without a `health` method counts as healthy.
  - `tlsTermination` adds no cost, since connections do not model TLS yet.
