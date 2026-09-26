# 1701 3D stack view

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M17 Visual extras and R2 release](../ROADMAP.md#m17-visual-extras-and-r2-release) | R2 | todo | [1202](../M12-patterns-and-r1-release/1202-r1-exit.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md): 3D stack view
- [Design system §14 3D views](../../docs/guidelines/design-system/14-3d-views.md)
- [Engineering §12 strata-graph and strata-3d](../../docs/guidelines/engineering/12-strata-graph-and-strata-3d.md): strata-3d

## Goal

Nested systems as stacked planes with request particles, loaded lazily and fully disposed on close.

## Tests to write first

Write these tests first, in `packages/3d/test/stack.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Opening the view loads Three.js; the 2D app never loads it
- [ ] Closing the view disposes every geometry, material and texture
- [ ] Clicking a plane drills into that system

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
