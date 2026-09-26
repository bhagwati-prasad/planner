# 0903 Black-box calibration

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M09 Chaos and analysis](../ROADMAP.md#m09-chaos-and-analysis) | R1 | todo | [0406](../M04-simulation-core/0406-black-box-expanded.md), [0804](../M08-scenarios-and-load/0804-metrics-pipeline.md) |

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Black-box models for composites

## Goal

Record latency distributions, capacity and error rates per public method from an expanded run and use them as the composite's black-box model.

## Tests to write first

Write these tests first, in `packages/sim/test/calibration.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A black-box run of a calibrated composite matches the expanded run's p50 and p99 within 5% at the same load
- [ ] Calibration data is stored with the component and shows its source run
- [ ] Changing the inner system marks the calibration stale

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
