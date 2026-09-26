# 0405 Edges, routing and the network model

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0403](../M04-simulation-core/0403-ctx-dispatch.md), [0308](../M03-component-model-and-plugins/0308-connection-types.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md): Connection types

## Goal

Edge latency, transmission delay, loss, timeouts and retries with backoff and jitter; routing rules by method, path, header, weight and expression.

## Tests to write first

Write these tests first, in `packages/sim/test/network.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Transmission delay equals payload size divided by bandwidth
- [ ] Weighted routing splits 10,000 seeded requests within tolerance
- [ ] A timeout triggers retries with the configured backoff, and every attempt appears in the trace

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
