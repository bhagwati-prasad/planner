# 0802 Load profiles and concurrency

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M08 Scenarios and load](../ROADMAP.md#m08-scenarios-and-load) | R1 | todo | [0801](../M08-scenarios-and-load/0801-scenarios.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Sources and load, Outputs

## Goal

Constant, ramp, step, spike, Poisson and CSV-replay profiles with many concurrent requests and sampled traces.

## Tests to write first

Write these tests first, in `packages/sim/test/load.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each profile's arrival counts per second match its definition within tolerance
- [ ] Trace sampling at 1% keeps about 1% of requests and all errors
- [ ] A load run is deterministic for its seed

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
