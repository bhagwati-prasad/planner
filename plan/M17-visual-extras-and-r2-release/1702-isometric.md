# 1702 Isometric deployment view

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M17 Visual extras and R2 release](../ROADMAP.md#m17-visual-extras-and-r2-release) | R2 | todo | [1701](../M17-visual-extras-and-r2-release/1701-stack-3d.md) |

## Read first

- [Design system §14 3D views](../../docs/guidelines/design-system/14-3d-views.md)

## Goal

The deployment view drawn isometrically with zones as plinths.

## Tests to write first

Write these tests first, in `packages/3d/test/isometric.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Zones and components match their deployment-view layout
- [ ] Selection syncs with the 2D canvas

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
