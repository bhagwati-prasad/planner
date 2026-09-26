# 0703 Comments UI and roll-up badges

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M07 Comments and R0 release](../ROADMAP.md#m07-comments-and-r0-release) | R0 | todo | [0702](../M07-comments-and-r0-release/0702-threads-anchors.md), [0511](../M05-shell/0511-scrubber-runs.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Comment pins
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Comment thread
- [Design system §8 Interaction patterns](../../docs/guidelines/design-system/08-interaction-patterns.md): Commenting

## Goal

Pins, the inspector Comments tab, the thread component, filters, the C shortcut, and open-thread badges rolled up onto composites.

## Tests to write first

Write these tests first, in `packages/ui/test/comments.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Pressing C with a component selected opens a new thread anchored to it
- [ ] A composite shows the count of open threads anywhere inside it
- [ ] Filters (mine, open, type, mentions me) narrow the list and pins

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
