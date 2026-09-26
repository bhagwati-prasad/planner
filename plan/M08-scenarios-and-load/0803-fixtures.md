# 0803 State fixtures

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M08 Scenarios and load](../ROADMAP.md#m08-scenarios-and-load) | R1 | todo | [0802](../M08-scenarios-and-load/0802-load-profiles.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): State
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Functional behaviour

## Goal

Load JSON and CSV fixtures into component state for functional runs.

## Tests to write first

Write these tests first, in `packages/sim/test/fixtures.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A CSV fixture loads into a `table` state field with typed columns
- [ ] A fixture that doesn't match the state schema fails with a path to the problem
- [ ] Fixtures are embedded in `.strata` exports

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
