# 0409 Starter library: service

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0408](../M04-simulation-core/0408-starter-messaging.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The service, complete per spec §9, on the servers the kernel models (ADR 0020): instances × concurrency servers, a bounded backlog, timeouts, retries with backoff, a circuit breaker per dependency, autoscaling, endpoints and their downstream calls.

## Tests to write first

Write these tests first, in `components/service/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A service with 2 instances × 4 concurrency queues the ninth concurrent request
- [ ] The circuit breaker opens at its error threshold and half-opens after its duration

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split.** As the human decided on 2026-09-30, the old 0409 (services, functions, gateways and balancers) became this task, 0419 (serverless function) and 0420 (load balancer and API gateway). Each keeps its tests. This task builds the kernel servers of ADR 0020 and `strata/testing`'s `runComponent`, which the other two use.
