# 0420 Starter library: load balancer and API gateway

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0409](../M04-simulation-core/0409-starter-compute.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The load balancer and the API gateway, complete per spec §9. The load balancer: its layer, algorithms (round-robin, least connections, weighted, IP hash, consistent hash), health checks with their thresholds, maximum connections, idle timeout, sticky sessions and TLS termination. The gateway: its routes, rate limit per key with its burst, auth mode, maximum payload, request timeout, transform latency and response cache.

## Tests to write first

Write these tests first, in `components/load-balancer/tests`, `components/api-gateway/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The gateway throttles traffic above its rate limit

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0409 on 2026-09-30, as the human decided.
