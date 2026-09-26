# 0208 Overlays and export

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0207](../M02-strata-graph/0207-lod-performance.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Scope and stubs, Simulation overlays, Debug overlays

## Goal

An overlay API for request dots, the followed-request trail, heat tints, scope outlines, stub and traffic markers, breakpoint dots and the current hop; SVG and PNG export.

## Tests to write first

Write these tests first, in `packages/graph/test/overlays.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Requesting 1,000 dots draws at most 400
- [ ] The scope overlay dims out-of-scope components to 30% opacity
- [ ] `exportSVG()` output has no external references and re-renders identically

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
