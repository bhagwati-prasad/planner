# 0209 Node states

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0202](../M02-strata-graph/0202-shapes-ports.md) |

Split from 0202 by the human on 2026-09-27.

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Node states
- [Engineering §12 strata-graph and strata-3d](../../docs/guidelines/engineering/12-strata-graph-and-strata-3d.md)

## Goal

Every node state in ds §6 has its treatment on the default component shape, in light and dark themes. The interaction states are hover, selected, multi-selected, keyboard focus, dragging, and valid or invalid connect target. The model states are planned, deprecated, by reference, missing component, failing, out of scope, run-only change and context ghost. The model states come in as node data from the host; strata-graph never works them out itself.

## Tests to write first

Write these tests first, in `packages/graph/test/states.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation. Visual snapshot baselines are created only after the human approves the screenshots.

- [ ] Every component state in ds §6 matches its visual snapshot in light and dark themes

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
