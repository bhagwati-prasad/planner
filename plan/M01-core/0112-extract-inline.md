# 0112 Extract as system and inline system

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0111](../M01-core/0111-method-bindings.md) |

Edges name the method they call ([ADR 0011](../../docs/adr/0011-edges-name-the-method-they-call.md)), and the planners emit primitive commands, including the new `node.move` and `node.own` ([ADR 0012](../../docs/adr/0012-how-compound-commands-plan-their-changes.md)).

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Structural roll-up

## Goal

Pure planners that produce command batches for extract and inline.

## Tests to write first

Write these tests first, in `packages/core/test/extract.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Extracting two components with three crossing edges creates a System with three boundary ports and rewired external edges
- [x] Methods called across the crossing edges become bound public methods of the new System
- [x] Property: `inline(extract(x))` equals `x` on random graphs
- [x] Extract is a single undo step

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
