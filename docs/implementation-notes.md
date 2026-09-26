# Implementation notes

What is built so far, and the decisions taken where the specification left room. Section numbers refer to the spec.

## M1 Core: what exists

### strata-core

| Area | Module | Notes |
| --- | --- | --- |
| Entity store (§5) | `store.js` | One table per kind with indexes on parent references. Entities are frozen plain objects with ULID `id`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`, `rev`. `snapshot()` / `load()` round-trip the whole model. |
| Transactions | `store.js` (`Tx`) | Record the previous value of everything touched: rollback on failure, savepoints for sub-commands, and the inverse used by undo. |
| Command bus, op log (§16) | `bus.js` | Commands are `{ type, payload }` and must be JSON-serialisable. Each applied command becomes an operation `{ id, actorId, timestamp, command, payload, inverse, modelRev, ids }`. `transaction(fn)` groups commands into one `batch` operation. Plugins register commands through the same API. |
| Undo/redo | `bus.js` | Undo applies the operation's inverse as a new `model.restore` operation; redo applies the inverse of that. Both are logged, so history syncs like any other change. |
| Replay | `bus.js` | `replay(ops)` reuses each operation's ids, timestamp and actor, and fails with `CONFLICT` if a handler allocates a different number of ids. Replaying a log reproduces the model byte for byte (tested, including extract, batches, undo and redo). |
| Events | `emitter.js` | `change` ({ op, changes }), `op`, `history`, `undo`, `redo`, and `*`. A throwing listener cannot break a command. |
| Components (§7) | `registry.js`, `builtins.js`, `props.js` | Manifest validation, versions side by side, `extends` inheritance, the nine base types plus `base:component` (common properties and metrics from §8), all 13 property types, distributions with quantiles and means. |
| Model commands | `commands/*.js` | `project.*`, `system.*`, `node.*`, `port.*`, `edge.*`, `boundary.*`, `view.*`. `core.commands()` lists them with signatures. |
| Recursion (§6) | `commands/recursion.js`, `model.js` | Placement by reference or by value, cycle rejection (direct and transitive), extract as system, inline, detach, boundary ports that propagate to every placement, port resolution through any depth, paths from the root. Tested to 10 levels. |
| Data roll-up (§6) | `rollup.js` | `sum`, `min`, `max`, `count`, `union`, `worst`, `critical-path`, `min-path`, `product`; system overrides; contracts; abstract (black-box) systems valued from their contract. |
| Problems | `validate.js` | Placeholders, unknown or invalid properties, broken or invalid edges, unmapped boundary ports, unused library systems, contract violations. |

### strata (facade)

`createStrata()` returns the object exposed as `strata` (§16): `projects` (create, open, list, use, close, delete, save through a storage adapter; an in-memory adapter for now), handles for systems, nodes, ports, edges and boundary ports, `nav` (drill-down breadcrumb), `$` and `select()`, `dispatch`, `transaction`, `undo`, `redo`, `on`, `print`, `format`, `help`, `components`, and `toTable()` on every collection. `strata.sim`, `test`, `debug`, `comments`, `docs` and `plan` exist as placeholders that name the release they arrive in.

## Decisions where the spec was silent

**Data model**
- Timestamps are ISO 8601 strings (readable in git diffs, R3). The model revision is an integer per applied operation; each entity also has its own `rev`.
- A composite node's ports are real port entities that mirror its system's boundary ports (`port.boundaryPortId`). Adding, renaming or removing a boundary port updates every placement at once (§6: "updates every parent that uses the system"). The connection types a mirror port accepts are derived from the internal port it resolves to.
- Systems record ownership: a system placed by value (or created by extract) has `ownerNodeId`; removing that node deletes the system and its subtree. A system that is neither the root nor owned is a library system, and only library systems may be placed by reference.
- Deleting a node unmaps boundary ports that pointed at it rather than removing them, so parents keep their interface and the Problems list shows the gap.
- The first use of a component type pins `id@version` in `project.components`. Unversioned references then resolve to the pinned version; an explicit other version can coexist. A versioned reference that is not installed becomes a placeholder that keeps its properties and ports.
- A system keeps at least one view; new systems get a "Logical" view with a default layer.

**Commands and history**
- Inverses are entity-level restore patches rather than hand-written semantic inverses. They are exact for every command, including compound ones such as extract, and plugins get undo for free. The forward command stays semantic in the log for R3 merge and R4 sync.
- Handlers normalise their logged payload (pinned type version, resolved default name and ports) so an op log replays on a machine without the component installed.
- Commands that change nothing are not logged. `project.init` is logged but not undoable.

**Recursion**
- Extract creates one boundary port per internal port and direction that traffic crosses (not one per edge), named after the port, and `Node.port` on a clash. Boundary ports of the parent that pointed into the selection are re-routed through the new composite. The child gets the next C4 level (context → container → component).
- The child view keeps the selection's positions; the composite appears at their centre in every parent view. Inline does the reverse, re-centring the nodes on the composite's position.
- Inlining a by-reference composite copies the library system's contents with new ids and leaves the library system untouched; inlining a by-value composite moves the nodes and keeps their ids.
- Read-only for by-reference placements (§6) is enforced by the facade: a system reached through a by-reference node is read-only there, while `project.system(name)` edits the source. `node.detach()` turns a reference into an editable copy.

**Roll-up**
- Rule lookup order: explicit option, the system's `rollups` override, the first manifest in the subtree that declares one (metric `key`, or property named by its first segment), then an override on a child system.
- Keys address properties by path: `latency.p99` on a distribution property is its 99th percentile; durations, sizes and rates roll up in ms, bytes and per second.
- Path rules run from the internal ports of `in` boundary ports (or nodes with no inbound edges) to `out` boundary ports (or sinks), on the graph with back edges removed. `min-path` reports the lowest value on any such path, which is conservative for fan-out; model replicas with the `instances` property rather than parallel nodes. `product` takes the worst path and treats `percent` properties as percentages.
- A composite whose children yield no value is valued from its contract (`equals`, else `max`, else `min`), which lets teams stub unfinished subsystems; `{ abstract: [systemId] }` forces this.

**Facade**
- Short type names prefer concrete components over built-in base types: `'service'` finds `starter.service` when it is installed, and `base:service` otherwise.
- `map` and `filter` on a Collection return plain arrays; methods that return collections return Collections.
- History is session state: it is not saved with the project (M5 decides whether to persist the op log).

## M2 strata-graph: what exists

The diagram library from §9. It knows nothing about Strata: hosts hand it plain graph data (`nodes`, `edges`, `frames`, `annotations`, `layers`) and receive intents (`select`, `move`, `resize`, `connect`, `connect-to-point`, `reconnect`, `waypoints`, `delete`, `open`, `context`, `drop`). It never changes the data itself; in Strata, the view adapter (M3) turns intents into commands and calls `setData` with the result, so undo and history stay in one place.

| Area | Module | Notes |
| --- | --- | --- |
| Geometry, ports | `geometry.js` | Rectangles, port anchors spread along sides, boundary anchors for port-less edges. |
| Routing | `routing.js` | Straight, curved (Bézier, Catmull-Rom through waypoints) and orthogonal. The orthogonal router runs A* over a sparse grid of obstacle edges with a bend penalty, leaves and enters along port sides, and only considers nearby obstacles (capped) so it stays fast. |
| Spatial index | `spatial.js` | Uniform grid for marquee selection, port hit-testing, smart-guide candidates and culling. |
| Snapping, arrange | `snap.js`, `arrange.js` | Grid snap, smart guides (edges and centres), align and distribute. |
| Viewport, text | `viewport.js`, `text.js` | d3-zoom-compatible transforms, fit and zoom-at; word wrapping with an injected measurer. |
| Data | `data.js` | Normalisation with defaults, problem reporting, frame nesting, layers (hidden, locked). |
| Theme | `theme.js` | Every colour, font and radius is a CSS custom property; light and dark sets. |
| Renderer | `dom/graph.js` | D3 joins into SVG layers; d3-zoom, d3-drag; gestures and keyboard; overlays; culling; SVG/PNG export. |
| Shapes | `dom/shapes.js` | box, rect, ellipse, diamond, hexagon, cylinder, queue, document, note, cloud, person, component, placeholder, boundary-port; hosts register more. |
| Minimap | `dom/minimap.js` | Overview with the visible area; click or drag to move. |

Tests: headless modules in Node; the renderer in real Chromium through Playwright (`npm run test:browser`), driving mouse and keyboard gestures, plus a smoke test of `examples/graph-demo.html` under the dev server's strict CSP.

## Decisions in M2

- **Selection is requested, not taken.** Clicks, marquees and keyboard emit a `select` intent; the host calls `graph.select(ids)`. The graph only keeps transient gesture state (a drag in progress).
- **Pointer model:** background drag draws a selection rectangle (Shift adds), Space+drag or the middle button pans, the wheel scrolls, Ctrl/⌘+wheel or a pinch zooms (Excalidraw-style rather than d3-zoom's default wheel-zoom). Marquees pick nodes and annotations they touch, frames they enclose, and edges whose ends are both picked.
- **Frames** are hit only on their border and title bar, so selection rectangles can start inside them. Dragging a frame moves everything nested in it; a `move` intent reports each moved item's innermost containing frame as `parent`.
- **Connections** can be drawn from either end: dragging from an input produces the same `connect` intent as dragging from the output. Dropping on a node picks its nearest suitable port. Validity is the host's call via `canConnect(source, target)`; by default outputs connect to inputs on other nodes.
- **Edges without their own routing follow the graph's current routing option.**
- **Ids are unique across all kinds**, since a selection mixes nodes, edges, frames and annotations.
- **Icons from plugins are sanitised** by an allowlist (drawing elements and presentation attributes only; no scripts, handlers, links, styles or external URLs; ids prefixed).
- **Culling** replaces the spec's Canvas 2D switch for now: above 600 items only what is near the view is in the DOM (2,000 nodes: first render under 1.5 s, drag frames under 60 ms in tests). A Canvas 2D node layer can follow if profiling on real diagrams asks for it.
- **D3 is vendored** as the unmodified 7.9.0 UMD bundle (`vendor/d3`), loaded as a classic script so it works from `file://`, and reached through `globalThis.d3` or the `d3` option, never imported.
- **Dev server:** browsers refuse ES modules from `file://`, so until the M4 bundler produces the offline build, development and browser tests use `scripts/dev-server.js`. It serves with a strict CSP (no inline scripts), matching the spec's served mode.

Known gaps, kept for later: parallel edge segments in the same channel overlap (no nudging yet); ports sit on the bounding box, so on curved shapes such as the cloud they float slightly off the outline; auto-layout (layered, force, tree) is R1.

## M3 Shell: what exists

The workspace from §9, as Web Components in `strata-ui`. Every element reaches the model through the `strata` facade it is handed, and changes it only through facade calls (which are commands), so the console, the op log and undo see exactly what the UI does.

| Area | Module | Notes |
| --- | --- | --- |
| View adapter | `adapter.js` (headless) | `toGraphData(system, {viewId})` turns the current system into strata-graph data; `applyIntent(intent, ...)` turns graph intents into facade calls. Node-tested. |
| Clipboard | `strata/src/clipboard.js` | `strata.copy`, `paste`, `duplicate`: a `strata/clip@1` JSON payload of nodes, their internal edges and positions; pasting is one transaction and reports what it had to skip. |
| Shell | `elements/shell.js`, `actions.js` | Selection (graph ids), one action registry (id, title, group, shortcut, enabled, run) that the palette, context menu, toolbar and keyboard all read. |
| App | `elements/app.js` | `<strata-app>`: regions from a JSON config, design tokens, theme (light, dark, or the OS preference), toasts, global shortcuts, the shortcuts overlay. |
| Canvas | `elements/canvas.js` | Hosts the graph and minimap; breadcrumb, page (view) tabs, zoom level, empty-state hint, error badges; drill-down transitions; a remembered viewport per system and page. |
| Panels | `library.js`, `tree.js`, `inspector.js`, `dock.js` | Library (search; drag or click to add; library systems by reference, as a copy, or opened), systems tree, inspector (properties by schema type, contracts, derived roll-ups, boundary ports), problems and console docks. |
| Overlays | `palette.js`, `menu.js` | Command palette (commands, add, find anywhere), context menu per target kind, toolbar with mode tabs. |
| Entry page | `app/` | Loads D3, creates `strata` with a sample "Checkout" project, mounts the workspace. `window.strata` is the full console API. |

Tests: the adapter in Node; the workspace in Chromium (`packages/strata-ui/test/browser/app.browser.js`), driving the real page with mouse and keyboard: adding from the library, the inspector, drill-down and back, palette, context menu, find, drag and drop, connecting ports, theme, console, problems, tree, swapping a region, the shortcuts overlay.

## Decisions in M3

- **Synthetic diagram items.** Inside a composite the adapter adds a system frame, the system's boundary ports on the frame's edge, the edges mapping each boundary port to its internal port, and context ghosts (the parent's neighbours, faded, outside the frame). Their ids carry prefixes (`frame:`, `bp:`, `map:`, `ghost:`, `ghostedge:`) so intents about them route correctly: connecting to a boundary port maps it, deleting a mapping edge unmaps it, and opening a ghost shows the parent's node in the inspector.
- **Nodes without a position in the view are placed by the adapter** in a grid below the laid-out ones (reported as `autoPlaced`), so a model built in the console appears on the canvas without a layout step. Those positions are drawn, not stored: the UI never changes the model on its own, and a node's position is recorded (`view.layout`) the first time someone moves it.
- **Backspace goes up a level** (breadcrumb back) and Delete deletes, so the shell passes `deleteKeys: ['Delete']` to the graph. The spec lists both; binding Backspace to delete made navigation destructive.
- **Drill-down transitions** zoom into the composite before its system appears, and back out of it on the way up (IcePanel-style). They are skipped under `prefers-reduced-motion`. Each system and page keeps its own viewport.
- **Reference placements are read-only where they are placed.** The canvas shows a badge in the breadcrumb, the graph goes read-only, and editing actions are disabled; the adapter refuses intents with `READ_ONLY` and says to open the source or detach.
- **The console dock is a command log plus a JSON command input.** The app runs under a CSP without `unsafe-eval`, so it cannot evaluate JavaScript; the full API is `strata` in DevTools, and the dock dispatches serialised commands (`{"type": ..., "payload": ...}`), which is what the spec's headless-first principle promises anyway.
- **Mode tabs** for Simulate, Debug, Test, Docs and Plan are shown and announce their release; only Design works in R0.
- **Swapping regions.** `DEFAULT_CONFIG.regions` lists element names per region (`header`, `left`, `center`, `right`, `bottom`) plus overlays. Any custom element with `strata` and `shell` properties can take a slot; the shell calls nothing else on it.
- **Shortcuts** are resolved from `KeyboardEvent.code` for digits so Shift+1 works on every layout; they are ignored while typing in a field, and keys the graph handles itself are left to it when the canvas has focus.
- **Theme** is `data-theme` on the document element with `--st-*` tokens (the graph's `--sg-*` tokens follow), stored per browser under `strata.theme`.

Known gaps, kept for later: the Metrics, Comments and Links inspector tabs are placeholders (M6 fills comments and links; metrics arrive with simulation in R1); patterns in the library are R1; the app needs the dev server until the M4 bundler produces the single-file offline build.

## Next: M4 Plugins

Manifest schema and validation, the in-house bundler (which also produces the offline single-file build), `strata pack` and `strata serve`, and the starter component library built on the same plugin API.
