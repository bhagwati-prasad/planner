# 0420 Starter library: API gateway

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0409](../M04-simulation-core/0409-starter-compute.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Behaviour API

## Goal

The API gateway, complete per spec §9: its routes, rate limit per key with its burst, auth mode, maximum payload, request timeout, transform latency and response cache.

## Tests to write first

Write these tests first, in `components/api-gateway/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] The gateway throttles traffic above its rate limit

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0409 on 2026-09-30, and from the load balancer (now 0421) on 2026-10-01, as the human decided.
- **Request timeout.** As the human decided on 2026-10-01, a method may await `Promise.race` of ctx promises, so the gateway can answer at its request timeout while the upstream still works.
- **Done (2026-10-01).** The tests are in `components/api-gateway/tests/api-gateway.test.js`. Beyond the listed one, they cover routes, the payload limit, the auth modes, the transform latency, the request timeout, upstream failures, the response cache, and that every method, error and metric is exercised. The await check's test is `packages/cli/test/checks.test.js`.
- **Changes beyond the gateway.**
  - `strata validate` accepts `await Promise.race(…)` of ctx promises, and spec §8, eng §10 and ADR 0021's amendment say so.
  - `runComponent` takes `edges`, the connection properties of the edge to each stub, so a test can make an upstream slow.
- **Limits.**
  - The verb comes from a `method` header, as for the service.
  - Upstream failures become `BAD_GATEWAY`, not the upstream's own code.
  - The cache is keyed by path alone.
  - Latency per route is left to M08's metrics, as for the service's endpoints.
