# 0417 Simulation on the facade and the determinism suite

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0415](../M04-simulation-core/0415-edits-branches.md), [0416](../M04-simulation-core/0416-breakpoints-inspection.md), [0412](../M04-simulation-core/0412-scope-stubs.md), [0115](../M01-core/0115-facade.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Console API
- [Engineering §18 Testing](../../docs/guidelines/engineering/18-testing.md)

## Goal

`strata.sim.start`, run handles with every control, `strata.debug.*`, and the cross-engine determinism suite.

## Tests to write first

Write these tests first, in `packages/facade/test/sim.test.js`, `tests/e2e/determinism.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The full spec §18 console example runs in Node
- [ ] The recursive fixture's checkout run has the same hash in Node, Chromium, Firefox and WebKit
- [ ] `strata.help('sim')` lists every control with its signature

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
