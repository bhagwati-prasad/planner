# 10. Design surface

The canvas is built on `strata-graph`, a small in-house D3 library that renders and captures gestures but never owns state. It emits intents; the Strata core turns them into commands and pushes new data back, so undo, history and collaboration live in one place.

## strata-graph API

```js
const g = strataGraph.create(hostEl, { grid: 10, theme: tokens })

g.registerShape('queue', {
  render(sel, d) { /* D3 enter/update for the node body */ },
  ports(d) { return [{ id: 'in', side: 'left' }, { id: 'out', side: 'right' }] }
})

g.setData({ nodes, edges, frames, annotations, overlays })   // idempotent render
g.on('intent', i => strata.dispatch(toCommand(i)))            // move, connect, resize, delete...
g.select(ids); g.zoomTo(ids, { animate: true }); g.fit()
g.setOverlay('heatmap', { values, scale })                     // simulation colouring
const svg = g.exportSVG(); const png = await g.exportPNG({ scale: 2 })
```

Internals: `d3-zoom` for pan and zoom, `d3-drag` for moves and connections, a spatial index for hit-testing and snapping ([ADR 0015](../adr/0015-strata-graph-uses-its-own-spatial-index.md)), `d3-force` and `d3-hierarchy` for auto-layout, plus an in-house layered (Sugiyama-style) layout and orthogonal edge router. Rendering is SVG; above about 1,500 visible elements it switches the node layer to Canvas 2D.

## Canvas features

| Feature | Release |
| --- | --- |
| Component and system library panel with search and drag-to-place | R0 |
| Ports, typed connectors, waypoints; straight, orthogonal and curved routing | R0 |
| Frames and groups, nested; trust-boundary and zone frames | R0 |
| Pages (views), layers with lock and hide | R0 |
| Sticky notes, callouts, text, free shapes (annotations) | R0 |
| Snapping, smart guides, align and distribute, grid | R0 |
| Undo/redo, copy/paste across systems, duplicate | R0 |
| Minimap, zoom to selection, breadcrumb, drill-down transitions | R0 |
| Command palette (Ctrl+K), full keyboard shortcuts, canvas search | R0 |
| Style panel, format painter, light and dark themes | R0 |
| Auto-layout (layered, force, tree) | R1 |
| Animated requests, followed-request trail, scope outlines and stub markers | R0 |
| Heatmaps and throughput-scaled edges | R1 |
| Sketch mode (hand-drawn look via path jitter) | R2 |
| 3D stack view and isometric deployment view | R2 |
| draw.io XML import | R2 |
| Presence cursors, follow mode | R4 |

## Workspace layout

- **Left:** library (components, systems, patterns) and the project tree of systems.
- **Centre:** canvas with breadcrumb and depth column, mode tabs (Design, Simulate, Debug, Test, Docs, Plan), and the run control bar, which is always visible.
- **Right:** inspector with tabs for Properties, State, Methods, Metrics, Comments and Links (ADRs, tickets, tests, docs).
- **Bottom dock:** Runs, Console, Logs, Trace, Test results and Problems, with the scrubber above them in Simulate and Debug modes.

Every region is a Web Component (`<strata-canvas>`, `<strata-inspector>`, `<strata-library>`, `<strata-console>` and so on). A JSON shell config decides which component fills which region (§18).

## 3D stack view (Three.js, R2)

Nested systems render as stacked translucent planes, one per depth level, with vertical links from each composite to its child plane. During simulation, requests travel as particles through the stack. Click a plane to drill in. A second mode draws the deployment view isometrically, Cloudcraft-style. Three.js loads lazily, so the offline 2D app never pays for it.

---
Part of the [Strata Product and Technical Specification](README.md).
