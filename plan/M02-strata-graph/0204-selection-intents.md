# 0204 Selection, dragging and connecting as intents

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0203](../M02-strata-graph/0203-edges-routing.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md)
- [Design system §8 Interaction patterns](../../docs/guidelines/design-system/08-interaction-patterns.md): Selection

## Goal

Click, Shift, Mod and marquee selection; drag to move; drag from port to port to connect; everything emitted as intents and never applied internally.

## Tests to write first

Write these tests first, in `packages/graph/test/interaction.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Dropping a dragged component emits one move intent, and it snaps back until `setData` confirms
- [ ] Connecting an output port to an input port emits a connect intent; an invalid target shows the invalid state
- [ ] The marquee selects every component whose bounds it intersects

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
