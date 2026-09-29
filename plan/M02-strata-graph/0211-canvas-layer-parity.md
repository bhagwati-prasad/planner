# 0211 Canvas layer parity: shapes, ports, connecting and keyboard focus

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | done | [0208](../M02-strata-graph/0208-overlays-export.md) |

## Read first

- [Spec §10 Design surface](../../docs/spec/10-design-surface.md): strata-graph API
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Components and nodes, Level of detail
- [Design system §9 Keyboard map](../../docs/guidelines/design-system/09-keyboard-map.md)
- [Engineering §12 strata-graph and strata-3d](../../docs/guidelines/engineering/12-strata-graph-and-strata-3d.md)

## Goal

Task 0207 draws components on one Canvas 2D image above 1,500 visible components. There they are rounded blocks with titles, and clicks, drags, double-clicks, context menus and hover work. This task closes the rest of the gap with the SVG layer:
- each built-in shape's outline;
- the heat, breakpoint, scope and hop overlays of 0208;
- ports that can start and end a connection;
- keyboard focus that moves between components and is visible.

## Tests to write first

Write these tests first, in `packages/graph/test/canvas.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] With 2,000 components, dragging from one component's output port to another's input port emits one connect intent, and a refused target shows the invalid state
- [x] With 2,000 components, Tab moves keyboard focus from component to component, a focus ring is drawn on the canvas, and Enter opens the focused component
- [x] With 2,000 components, a cylinder, a person and a card are drawn as their own shapes, and the heat, breakpoint and scope overlays are drawn on them
- [x] Panning 2,000 components stays under 16 ms per frame (a second measure in `tools/bench/graph-pan.bench.js`)

## Out of scope

- Icons, badges and node states inside canvas components, beyond what the level-of-detail band for the zoom draws.
- Screen-reader navigation of 2,000 components; it goes with the shell's accessibility work in M05.

## Notes

- Hit-testing stays on the spatial index (ADR 0015). Ports are found as the nearest port within the 12 px hit radius of design system §6.
- strata-graph measures 107.9 KB of its 110 KB budget (ADR 0014) after 0208. If this task needs more, stop and ask the human before writing the code. It needed about 2.7 KB, and the human chose [ADR 0016](../../docs/adr/0016-strata-graph-budget-of-115-kb.md): 115 KB for strata-graph and 235 KB for strata-ui.

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
