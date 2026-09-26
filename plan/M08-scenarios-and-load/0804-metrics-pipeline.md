# 0804 Metrics pipeline and charts

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M08 Scenarios and load](../ROADMAP.md#m08-scenarios-and-load) | R1 | todo | [0802](../M08-scenarios-and-load/0802-load-profiles.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Outputs
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Metric tile
- [Design system §12 Data visualisation](../../docs/guidelines/design-system/12-data-visualisation.md)

## Goal

1 s metric buckets, log-bucketed percentiles, streaming in chunks of at most 64 KB every 100 ms, metric tiles and time-series charts.

## Tests to write first

Write these tests first, in `packages/sim/test/metrics.test.js`, `packages/ui/test/charts.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Percentiles from the histogram are within 1% of exact values on seeded data
- [ ] Stream chunks never exceed 64 KB or arrive more often than every 100 ms
- [ ] Charts follow ds §12 and include a "View as table" toggle

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
