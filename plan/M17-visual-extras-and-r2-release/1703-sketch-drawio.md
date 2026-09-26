# 1703 Sketch mode and draw.io import

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M17 Visual extras and R2 release](../ROADMAP.md#m17-visual-extras-and-r2-release) | R2 | todo | [1202](../M12-patterns-and-r1-release/1202-r1-exit.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md)
- [Design system §15 Theming and implementation](../../docs/guidelines/design-system/15-theming-and-implementation.md)

## Goal

Seeded path jitter for sketch mode, and import of draw.io XML with shapes mapped to components where possible.

## Tests to write first

Write these tests first, in `packages/graph/test/sketch.spec.js`, `packages/plugins/test/drawio.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Sketch mode is deterministic for a seed and changes only strokes
- [ ] A draw.io fixture imports with components, edges, groups and labels
- [ ] Unmappable shapes import as annotations and are listed in a report

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
