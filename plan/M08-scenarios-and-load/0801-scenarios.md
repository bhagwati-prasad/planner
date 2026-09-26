# 0801 Scenarios

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M08 Scenarios and load](../ROADMAP.md#m08-scenarios-and-load) | R1 | todo | [0704](../M07-comments-and-r0-release/0704-r0-exit.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Sources and load

## Goal

The scenario model (steps, variables, extraction, think time, inline checks) with a form editor and a JSON view.

## Tests to write first

Write these tests first, in `packages/sim/test/scenarios.test.js`, `packages/ui/test/scenarios.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A login-then-order scenario extracts `$.token` and sends it on the next step
- [ ] A failing inline check marks the request failed and records the reason in the trace
- [ ] The form editor and JSON view round-trip without loss

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
