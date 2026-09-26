# 0506 Canvas view adapter and outline view

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0505](../M05-shell/0505-app-shell.md), [0208](../M02-strata-graph/0208-overlays-export.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md)
- [Design system §8 Interaction patterns](../../docs/guidelines/design-system/08-interaction-patterns.md): Selection
- [Design system §10 Accessibility](../../docs/guidelines/design-system/10-accessibility.md): Canvas

## Goal

Map the model to graph data and intents to commands; the selection model; canvas keyboard navigation with announcements; the accessible outline view.

## Tests to write first

Write these tests first, in `packages/ui/test/canvas.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Dragging a component dispatches one move command and undo restores its position
- [ ] Arrow keys move focus to the nearest component in that direction and the live region announces it
- [ ] The outline view lists the same graph and supports rename, comment and drill-in

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
