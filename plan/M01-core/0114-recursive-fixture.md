# 0114 The recursive payments fixture

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0112](../M01-core/0112-extract-inline.md), [0113](../M01-core/0113-rollups.md) |

## Read first

- [Engineering §9 Recursion rules](../../docs/guidelines/engineering/09-recursion-rules.md)

## Goal

A builder in `tools/fixtures/recursive-payments.js` that creates the shared fixture through commands: three levels, one by-reference and one by-value inner system, and one component opened as a system that keeps its behaviour.

## Tests to write first

Write these tests first, in `packages/core/test/fixture.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] The fixture passes graph and binding validation
- [x] It contains every case listed in eng §9
- [x] Building it twice with the same seed produces the same state hash

## Notes

- Other packages reuse this builder. M06 adds a `.strata` export of it.

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
