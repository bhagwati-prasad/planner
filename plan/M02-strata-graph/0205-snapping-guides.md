# 0205 Snapping, smart guides, align and distribute

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0204](../M02-strata-graph/0204-selection-intents.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Selection and manipulation

## Goal

Grid snapping, smart guides with distance labels, a 6 px snap threshold, and align and distribute intents.

## Tests to write first

Write these tests first, in `packages/graph/test/guides.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Dragging within 6 screen px of alignment snaps and shows a guide
- [ ] Align-left on three components emits one intent with three positions

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
