# 2001 Cost model

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M20 Integrations, cost and planning](../ROADMAP.md#m20-integrations-cost-and-planning) | R3 | todo | [0902](../M09-chaos-and-analysis/0902-heat-bottleneck.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Outputs
- [Spec §21 Security, non-functional requirements and resolved questions](../../docs/spec/21-security-non-functional-requirements-and-resolved-questions.md): Resolved questions: cost modelling

## Goal

Cost estimates from generic price properties, rolled up with `sum` and shown per run.

## Tests to write first

Write these tests first, in `packages/sim/test/cost.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A run's cost equals the sum of per-component costs for its duration
- [ ] Composite cost rolls up from inside
- [ ] Estimates are marked with "≈" and show currency

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
