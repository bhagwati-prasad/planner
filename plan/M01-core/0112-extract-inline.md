# 0112 Extract as system and inline system

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0111](../M01-core/0111-method-bindings.md) |

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Structural roll-up

## Goal

Pure planners that produce command batches for extract and inline.

## Tests to write first

Write these tests first, in `packages/core/test/extract.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Extracting two components with three crossing edges creates a System with three boundary ports and rewired external edges
- [ ] Methods called across the crossing edges become bound public methods of the new System
- [ ] Property: `inline(extract(x))` equals `x` on random graphs
- [ ] Extract is a single undo step

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
