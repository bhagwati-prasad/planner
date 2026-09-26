# 0409 Starter library: services, functions, gateways and balancers

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

Service, serverless function, load balancer and API gateway, complete per spec §9.

## Tests to write first

Write these tests first, in `components/service/tests`, `components/serverless-function/tests`, `components/load-balancer/tests`, `components/api-gateway/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A service with 2 instances × 4 concurrency queues the ninth concurrent request
- [ ] The circuit breaker opens at its error threshold and half-opens after its duration
- [ ] Cold starts follow the configured probability within tolerance over 10,000 seeded invocations
- [ ] The gateway throttles traffic above its rate limit

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
