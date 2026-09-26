# 0113 Roll-up engine

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0111](../M01-core/0111-method-bindings.md) |

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Data roll-up

## Goal

Memoised roll-up rules (sum, min, max, min-path, critical-path, worst, product, union, count) invalidated by events, plus contract checks.

## Tests to write first

Write these tests first, in `packages/core/test/rollup.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each rule computes the expected value on a hand-built three-level graph
- [ ] A change inside a system invalidates only its ancestors' cached roll-ups
- [ ] A contract that the derived value breaks produces a problem entry

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
