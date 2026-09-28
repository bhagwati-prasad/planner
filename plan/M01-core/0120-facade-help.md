# 0120 Help metadata for every facade method

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0115](../M01-core/0115-facade.md) |

Split from 0115 by the human on 2026-09-27.

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md)
- [Engineering §21 Facade and console API design](../../docs/guidelines/engineering/21-facade-and-console-api-design.md)

## Goal

Every public method of `strata` and its handles has help metadata (a signature, a one-line description and an example), and `strata.help()` is generated from it. `strata.print()` renders the recursive fixture (0114) as a stable text tree.

The metadata took core, facade and the non-UI packages past their 250 KB budget, so the human decided on 2026-09-27 that it has its own budget line in eng §15 ([ADR 0013](../../docs/adr/0013-console-help-metadata-has-its-own-budget.md)).

## Tests to write first

Write these tests first, in `packages/facade/test/help.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Every facade method has help metadata
- [x] `strata.print()` renders the recursive fixture as a stable text tree (snapshot)

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
