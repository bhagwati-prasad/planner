# 0202 Shape registry, components and ports

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0201](../M02-strata-graph/0201-scene-zoom.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Node anatomy, Node states

## Goal

`registerShape()`; the default component shape with icon tile, title, subtitle and badges; ports shown on hover, selection and connect.

## Tests to write first

Write these tests first, in `packages/graph/test/shapes.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A registered shape renders through its `render` function with keyed joins
- [ ] Every component state in ds §6 matches its visual snapshot in light and dark themes
- [ ] Port hit areas are 24 px although ports draw at 8 px

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
