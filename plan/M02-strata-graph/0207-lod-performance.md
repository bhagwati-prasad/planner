# 0207 Level of detail and performance

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | done | [0206](../M02-strata-graph/0206-frames-annotations.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Level of detail
- [Engineering §12 strata-graph and strata-3d](../../docs/guidelines/engineering/12-strata-graph-and-strata-3d.md)
- [Engineering §15 Performance budgets](../../docs/guidelines/engineering/15-performance-budgets.md)

## Goal

Zoom-based level of detail, rev-based partial updates, quadtree hit-testing and a Canvas 2D component layer above 1,500 elements.

## Tests to write first

Write these tests first, in `packages/graph/test/lod.spec.js`, `tools/bench/graph-pan.bench.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] At each zoom band the drawn parts match the ds §6 table
- [x] Panning 500 components stays under 16 ms per frame (benchmark)
- [x] With 2,000 components the canvas layer is used and hit-testing is still exact

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
