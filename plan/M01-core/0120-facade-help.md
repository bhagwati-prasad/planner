# 0120 Help metadata for every facade method

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0115](../M01-core/0115-facade.md) |

Split from 0115 by the human on 2026-09-27.

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md)
- [Engineering §21 Facade and console API design](../../docs/guidelines/engineering/21-facade-and-console-api-design.md)

## Goal

Every public method of `strata` and its handles has help metadata (a signature, a one-line description and an example), and `strata.help()` is generated from it. `strata.print()` renders the recursive fixture (0114) as a stable text tree.

## Tests to write first

Write these tests first, in `packages/facade/test/help.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every facade method has help metadata
- [ ] `strata.print()` renders the recursive fixture as a stable text tree (snapshot)

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
