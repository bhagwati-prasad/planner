# 0115 Facade, handles and help metadata

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0114](../M01-core/0114-recursive-fixture.md), [0106](../M01-core/0106-op-log.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md)
- [Engineering §21 Facade and console API design](../../docs/guidelines/engineering/21-facade-and-console-api-design.md)

## Goal

`createStrata(adapters)` with project, system and component handles, events, `help()`, `print()` and `toTable()`.

## Tests to write first

Write these tests first, in `packages/facade/test/facade.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Handles re-read state, so a rename made by command is visible through an older handle
- [ ] Every facade method has help metadata
- [ ] `strata.print()` renders the recursive fixture as a stable text tree (snapshot)
- [ ] The spec §18 console example runs in Node up to the first simulation call

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
