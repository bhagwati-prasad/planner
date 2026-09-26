# 0901 Fault injection

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M09 Chaos and analysis](../ROADMAP.md#m09-chaos-and-analysis) | R1 | todo | [0802](../M08-scenarios-and-load/0802-load-profiles.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Chaos

## Goal

Fault schedules (component down, added latency, error rate, loss, partition, consumers to zero, outage windows) in code and on a timeline editor.

## Tests to write first

Write these tests first, in `packages/sim/test/faults.test.js`, `packages/ui/test/faults.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Taking a component down for 20 s at 30 s makes its calls fail only in that window
- [ ] A partition between two zones blocks cross-zone edges only
- [ ] Fault windows appear as bands on the scrubber

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
