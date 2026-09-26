# 0509 Depth language and drill navigation

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0506](../M05-shell/0506-canvas-adapter.md) |

## Read first

- [Design system §5 The depth language (signature)](../../docs/guidelines/design-system/05-the-depth-language-signature.md)
- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Drill-down, Structural roll-up

## Goal

Depth column, breadcrumb swatches, layered components, level frame, context ghosts, peek, drill transitions, and the open-as-system, extract and inline flows.

## Tests to write first

Write these tests first, in `packages/ui/test/depth.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Drilling three levels into the recursive fixture updates the depth column and breadcrumb
- [ ] With reduced motion, drill transitions are a 120 ms cross-fade
- [ ] The extract preview names boundary ports after the crossing edges and applies as one undo step

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
