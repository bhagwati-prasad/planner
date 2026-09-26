# 0902 Heat overlays and bottleneck finder

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M09 Chaos and analysis](../ROADMAP.md#m09-chaos-and-analysis) | R1 | todo | [0804](../M08-scenarios-and-load/0804-metrics-pipeline.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Outputs
- [Design system §3 Design tokens](../../docs/guidelines/design-system/03-design-tokens.md): Data colours
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Simulation overlays

## Goal

Utilisation, latency, error and queue-depth overlays with the heat ramp, throughput-scaled edges, and a bottleneck finder with a one-sentence explanation.

## Tests to write first

Write these tests first, in `packages/sim/test/bottleneck.test.js`, `packages/ui/test/heat.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] On a fixture with an undersized database, the finder names the database and why
- [ ] Heat colours follow the ds §3 ramp thresholds
- [ ] Edge widths scale logarithmically with throughput between 1.5 and 8 px

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
