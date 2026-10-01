# 0409 Starter library: service

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0408](../M04-simulation-core/0408-starter-messaging.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The service, complete per spec §9, on the servers the kernel models (ADR 0020): instances × concurrency servers, a bounded backlog, timeouts, retries with backoff, a circuit breaker per dependency, autoscaling, endpoints and their downstream calls.

## Tests to write first

Write these tests first, in `components/service/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A service with 2 instances × 4 concurrency queues the ninth concurrent request
- [x] The circuit breaker opens at its error threshold and half-opens after its duration

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split.** As the human decided on 2026-09-30, the old 0409 (services, functions, gateways and balancers) became this task, 0419 (serverless function) and 0420 (load balancer and API gateway). Each keeps its tests. This task builds the kernel servers of ADR 0020 and `strata/testing`'s `runComponent`, which the other two use.
- **Done (2026-10-01).** The tests are in `components/service/tests/service.test.js`, with the kernel's in `packages/sim/test/servers.test.js` and `component.test.js`. Beyond the two listed, they cover the backlog and its timeout, endpoints, retries, autoscaling, and that every public method, declared error and metric is exercised.
- **Decisions.** As the human decided on 2026-09-30 and 2026-10-01:
  - ADR 0020's servers are declared by `base:service` and by a manifest's `servers` field (`E_MANIFEST_SERVERS`).
  - ADR 0021 adds `await ctx.spend(dist)`.
  - eng §6 lets the CLI import strata-sim, for `runComponent`.
  - The service gains a public `request` method, the default of its `in` port. The facade test that lists the starter components' methods now expects `request health` for the service, and spec §9's row says so.
  - `createTestContext` moved from strata-plugins to strata-sim with its tests, which changed only their import, to keep core within budget (ADR 0017's amendment).
- **Kernel.** A count that counts a state field and grows admits waiting calls when any call or timer of the node ends, not only when a server is released; the autoscaler needs this (ADR 0020's implementation notes).
- **Limits.**
  - An endpoint's name is a path, or a verb and a path. The verb comes from the request's `method` header, since messages carry no HTTP verb of their own.
  - An endpoint's `serviceTime` is in ms or a distribution of ms, since behaviour code cannot convert units.
  - Autoscaling sees only the requests on its servers, not those in the backlog, so it never goes below one instance.
  - `cpuPerRequest` and `memoryPerRequest` are not modelled yet.
  - Latency per endpoint is measured from spans by the metrics work of M08; the service reports no per-endpoint metric.
