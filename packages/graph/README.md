# strata-graph

The generic D3 diagram library: it renders graph data and emits intents, and knows nothing about Strata. Only `src/dom/` touches the DOM.

- Runs in: Browser (headless parts in Node)
- Specification: spec §10
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`

## Large diagrams

- **Zoom bands.** What is drawn follows the zoom bands of design system §6. The graph sets `sg-lod-mid` below 75%, `sg-lod-low` below 40% and `sg-lod-min` below 15% on its root, and the stylesheet hides parts by those classes.
- **Revs.** Give nodes, frames and edges a `rev`, and the graph redraws an item only when its rev changes (eng §12). Without one, it compares the item's data.
- **Culling.** Above `cullThreshold` items (default 600), only items near the view are rendered.
- **Canvas layer.** Above 1,500 visible components, the node layer is one Canvas 2D image. Clicks, drags, double-clicks, context menus and hover reach components through the spatial index ([ADR 0015](../../docs/adr/0015-strata-graph-uses-its-own-spatial-index.md)).
  - Each component draws its shape's outline, taken from the shape's own SVG, so a host's shapes keep their outlines too.
  - The heat, breakpoint, scope and hop overlays are drawn on the canvas as well.
  - The component under the pointer, the focused one, and the two ends of a connection being drawn are drawn again in SVG above the canvas. That gives them ports to connect, a focus ring and hover states.
  - Tab and Shift+Tab move focus from component to component, and Enter opens the focused one.
- **Benchmark.** `npm run bench` measures panning 500 components, and 2,000 on the canvas layer, against eng §15's 16 ms frame budget (`tools/bench/graph-pan.bench.js`).

## Overlays and export

- **Overlays.** `setOverlay(name, spec)` draws what simulation and debugging need over the diagram (design system §6):
  - `heatmap`, on §3's heat ramp;
  - `requests`, at most 400 dots;
  - `followed`, a request and its trail;
  - `scope`, with stub and traffic markers;
  - `breakpoints`;
  - `hop`.
  Its JSDoc gives each spec. Request dots and the followed request redraw on their own, so moving them every frame stays cheap.
- **Export.** `exportSVG()` writes a standalone document: styles resolved, no external references, and ids that do not depend on which graph drew it, so the same data exports the same file. `exportPNG()` rasterises that document.
