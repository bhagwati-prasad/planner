# 0805 Performance at scale

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M08 Scenarios and load](../ROADMAP.md#m08-scenarios-and-load) | R1 | todo | [0804](../M08-scenarios-and-load/0804-metrics-pipeline.md) |

## Read first

- [Spec §21 Security, non-functional requirements and resolved questions](../../docs/spec/21-security-non-functional-requirements-and-resolved-questions.md): Non-functional requirements
- [Engineering §15 Performance budgets](../../docs/guidelines/engineering/15-performance-budgets.md)

## Goal

Meet the simulation budgets at scale and guard them in CI.

## Tests to write first

Write these tests first, in `tools/bench/scale.bench.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] 500 components at 1,000 req/s for 60 simulated seconds finish in under 10 s
- [ ] Snapshot overhead stays under 10% of throughput
- [ ] The benchmark fails CI on a 10% regression

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
