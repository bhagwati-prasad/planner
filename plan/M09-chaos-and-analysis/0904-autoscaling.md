# 0904 Autoscaling and resilience behaviour under load

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M09 Chaos and analysis](../ROADMAP.md#m09-chaos-and-analysis) | R1 | todo | [0901](../M09-chaos-and-analysis/0901-faults.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources

## Goal

Autoscalers that read metrics with delay and cooldown, and retries and circuit breakers verified under load and faults.

## Tests to write first

Write these tests first, in `packages/sim/test/autoscaling.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Scale-up lag appears as a latency spike of the expected length
- [ ] Cooldown prevents flapping under an oscillating load
- [ ] Retry storms during an outage are visible in metrics and traces

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
