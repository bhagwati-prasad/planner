# 0010 Walking skeleton: draw and animate

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | todo | [0006](../M00-foundation-and-walking-skeleton/0006-vendor-libs.md), [0009](../M00-foundation-and-walking-skeleton/0009-skeleton-sim.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md)
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md)

## Goal

A bare `strata.html` that draws the two components and the edge with D3 and animates the request, loaded from `file://` with no network.

## Tests to write first

Write these tests first, in `tests/e2e/skeleton-canvas.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] From `file://` the page renders two component elements and one edge element
- [ ] Clicking Run animates a dot along the edge and shows the response time
- [ ] The page works with Playwright's offline mode enabled

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
