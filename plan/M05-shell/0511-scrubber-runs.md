# 0511 Scrubber, runs panel and canvas run overlays

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0510](../M05-shell/0510-run-bar.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Scope and stubs, Simulation overlays, Debug overlays
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Scrubber, Runs panel

## Goal

The scrubber with markers, the runs tree with comparison, and canvas overlays for requests, the followed trail, scope, stubs, breakpoints, the current hop and the paused banner.

## Tests to write first

Write these tests first, in `packages/ui/test/scrubber.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Stepping back three followed hops moves the dot back along its trail, and the inspector shows the earlier state
- [ ] The scrubber shows markers for breakpoints, faults, errors, edits and branches
- [ ] Selecting two runs opens a side-by-side comparison

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
