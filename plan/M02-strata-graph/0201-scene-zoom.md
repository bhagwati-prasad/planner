# 0201 Scene, layers and zoom

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0010](../M00-foundation-and-walking-skeleton/0010-skeleton-canvas.md), [0007](../M00-foundation-and-walking-skeleton/0007-ci-and-browser-tests.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md)
- [Engineering §12 strata-graph and strata-3d](../../docs/guidelines/engineering/12-strata-graph-and-strata-3d.md)
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Background

## Goal

`strataGraph.create(el, opts)` with the fixed layer order, d3-zoom pan and zoom, the dot grid, `fit()` and `zoomTo()`.

## Tests to write first

Write these tests first, in `packages/graph/test/scene.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Layer groups exist in the order given in eng §12
- [ ] Calling `setData` twice with the same data causes no DOM mutations
- [ ] `zoomTo(ids)` frames those ids and skips animation under reduced motion
- [ ] Minor grid dots fade out below 50% zoom

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
