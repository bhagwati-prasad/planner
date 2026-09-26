# 0206 Frames, zones, boundaries and annotations

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0204](../M02-strata-graph/0204-selection-intents.md) |

## Read first

- [Design system §5 The depth language (signature)](../../docs/guidelines/design-system/05-the-depth-language-signature.md): Level frame
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Frames, zones and boundaries; Annotations

## Goal

Group frames, the level frame with boundary ports, zones, trust boundaries, notes, callouts, text and highlight regions.

## Tests to write first

Write these tests first, in `packages/graph/test/annotations.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The level frame draws boundary ports on its edge with labels outside
- [ ] Moving a frame moves its contents in one intent
- [ ] Annotations render above components and are included in exports

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
