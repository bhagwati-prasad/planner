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
| Recursion (§6) | `commands/recursion.js`, `planners.js`, `model.js` | Placement by reference or by value, cycle rejection (direct and transitive), extract as system, inline, detach, boundary ports that propagate to every placement, port resolution through any depth, paths from the root. Extract and inline run the primitive commands a pure planner returns (ADR 0012), and `core.planExtract` and `core.planInline` preview them. Tested to 10 levels. |
| Data roll-up (§6) | `rollup.js`, `rollup-cache.js` | `sum`, `min`, `max`, `count`, `union`, `worst`, `critical-path`, `min-path`, `product`; system overrides; contracts; abstract (black-box) systems valued from their contract. `core.rollup` memoises frozen results per system: a committed change bumps the revision of each system it touched and of every system above, and a new component type invalidates them all. A value source (`values`) is never cached. |
| Problems | `validate.js` | Placeholders, unknown or invalid properties, broken or invalid edges, unmapped boundary ports, unused library systems, contract violations. |

### strata (facade)

`createStrata(adapters)` returns the object exposed as `strata` (§16). It needs a clock adapter and takes the others (random source, output) from the environment, which passes them at startup; the core and the facade touch no clock, timer or console of their own (task 0103). It offers `projects` (create, open, list, use, close, delete, save through a storage adapter; an in-memory adapter for now), handles for systems, nodes, ports, edges and boundary ports, `nav` (drill-down breadcrumb), `$` and `select()`, `dispatch`, `transaction`, `undo`, `redo`, `on`, `print`, `format`, `help`, `components`, and `toTable()` on every collection. `strata.sim.start()` runs the walking skeleton's single request (task 0010) through an injected simulation host: a Blob-URL worker in the offline app, and the kernel in the calling thread by default. `test`, `debug`, `comments`, `docs` and `plan` exist as placeholders that name the release they arrive in. `strata.help()` is generated from the facade's JSDoc (`tools/help`, task 0120), and `strata.print()` shows each composite's method bindings, the method each edge calls, and components opened as systems.

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
- Extract binds the methods called across the entering edges on the new System's boundary ports: an edge's method, or every method its port exposes when it names none (ADR 0011). Bindings of the parent that targeted a moved component go through the new System, and inline puts them back (ADR 0010).
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
| Viewport, text | `viewport.js`, `text.js` | d3-zoom-compatible transforms, fit and zoom-at; word wrapping and one-line truncation with an ellipsis, with an injected measurer. |
| Data | `data.js` | Normalisation with defaults, problem reporting, frame nesting, layers (hidden, locked). |
| Theme | `theme.js` | Every colour, font and radius is a CSS custom property; light and dark sets. |
| Renderer | `dom/graph.js` | D3 joins into SVG layers in the order of eng §12 (grid, frames and zones, edges, nodes, overlays, annotations, comment pins, handles); each element keeps the key of what it last drew and is skipped while that is unchanged, so an identical `setData` mutates nothing; the dot grid of design system §6 in world space (minor dots fade out below 50% zoom); d3-zoom, with `zoomTo` and `fit` jumping instead of animating under `prefers-reduced-motion`; d3-drag; gestures and keyboard; overlays; culling; SVG/PNG export. |
| Shapes | `dom/shapes.js` | card (the default, the component of design system §6: icon tile, one-line title with an ellipsis and the full name as the node's tooltip, subtitle, up to three badges then "+N" on the top edge; with an inner system, 208 × 64 with two stratum outlines and a stack glyph), box, rect, ellipse, diamond, hexagon, cylinder, queue, document, note, cloud, person, component, placeholder, boundary-port; hosts register more. A shape's `render` is the enter/update of the node body (spec §10): it runs again on the same group whenever the node changes and draws through keyed joins (`part()`), so elements are updated rather than recreated. |
| Minimap | `dom/minimap.js` | Overview with the visible area; click or drag to move. |

Tests: headless modules in Node; the renderer in real Chromium through Playwright (`npm run test:browser`), driving mouse and keyboard gestures, plus a smoke test of `examples/graph-demo.html` under the dev server's strict CSP.

## Decisions in M2

- **Selection is requested, not taken.** Clicks, marquees and keyboard emit a `select` intent; the host calls `graph.select(ids)`. The graph only keeps transient gesture state (a drag in progress).
- **Pointer model:** background drag draws a selection rectangle (Shift adds), Space+drag or the middle button pans, the wheel scrolls, Ctrl/⌘+wheel or a pinch zooms (Excalidraw-style rather than d3-zoom's default wheel-zoom). Marquees pick nodes and annotations they touch, frames they enclose, and edges whose ends are both picked.
- **Frames** are hit only on their border and title bar, so selection rectangles can start inside them. Dragging a frame moves everything nested in it; a `move` intent reports each moved item's innermost containing frame as `parent`.
- **Node states** follow design system §6. The host sends the model states as node data: `status` ('planned' or 'deprecated'), `readOnly` (a placement by reference: a lock, no resize handles), `missing` (the type reference: a hatch, a warning glyph and "Missing: …"), `failing`, `outOfScope`, `runChanges` (a warning dot, the changes in the tooltip) and `ghost`. Hover, selection (a 4 px halo; a multi-selection gets one bounding box, whose handles are 0204's), keyboard focus, dragging (elevation and a dashed outline at the origin) and connect targets are the graph's own. The default light and dark themes use the semantic colours of design system §3 for the canvas, nodes, ports, edges, selection, focus and status; frames, zones and annotations follow in 0206.
- **Connection kinds** follow design system §6 through an edge's `kind`: 'sync' (solid, filled triangle), 'stream' (solid, double chevron, at both ends when `bidirectional`), 'async' (dashed 6/4, open triangle), 'db' (solid, a 4 px dot at the source) and 'batch' (dotted 2/4, open triangle). A label sits on a surface-coloured pill, and an edge bound to a `method` shows its name there in IBM Plex Mono. Orthogonal routes have 8 px corner radii. The Strata view adapter passes kinds and methods from connection types in 0506.
- **Ports** draw as 8 px dots and are hit within 24 px (design system §6); they appear on hover, selection, keyboard focus and while a connection is being drawn.
- **Connections** can be drawn from either end: dragging from an input produces the same `connect` intent as dragging from the output. Dropping on a node picks its nearest suitable port. Validity is the host's call via `canConnect(source, target)`, which returns true, false, or the reason as a string; by default outputs connect to inputs on other nodes. A refused port under the pointer shows the invalid connect state of design system §6: a dashed danger ring, a not-allowed cursor and the reason above the node.
- **Edges without their own routing follow the graph's current routing option.**
- **Ids are unique across all kinds**, since a selection mixes nodes, edges, frames and annotations.
- **Icons from plugins are sanitised** by an allowlist (drawing elements and presentation attributes only; no scripts, handlers, links, styles or external URLs; ids prefixed).
- **Culling** replaces the spec's Canvas 2D switch for now: above 600 items only what is near the view is in the DOM (2,000 nodes: first render under 1.5 s, drag frames under 60 ms in tests). A Canvas 2D node layer can follow if profiling on real diagrams asks for it.
- **D3 is vendored** as the unmodified 7.9.0 UMD bundle (`vendor/d3`), loaded as a classic script so it works from `file://`, and reached through `globalThis.d3` or the `d3` option, never imported.
- **Dev server:** browsers refuse ES modules from `file://`, so development and browser tests serve the sources (`scripts/dev-server.js`, since M4 a thin wrapper over the `strata serve` server) with a strict CSP (no inline scripts), matching the spec's served mode. The offline `file://` app is the bundled build (M4).

Known gaps, kept for later: segments of edges between different pairs that share a channel still overlap (edges between the same two ends are fanned out 10 px apart); ports sit on the bounding box, so on curved shapes such as the cloud they float slightly off the outline; auto-layout (layered, force, tree) is R1.

## M3 Shell: what exists

The workspace from §9, as Web Components in `strata-ui`. Every element reaches the model through the `strata` facade it is handed, and changes it only through facade calls (which are commands), so the console, the op log and undo see exactly what the UI does.

| Area | Module | Notes |
| --- | --- | --- |
| View adapter | `adapter.js` (headless) | `toGraphData(system, {viewId})` turns the current system into strata-graph data; `applyIntent(intent, ...)` turns graph intents into facade calls. Node-tested. |
| Clipboard | `facade/src/clipboard.js` | `strata.copy`, `paste`, `duplicate`: a `strata/clip@1` JSON payload of nodes, their internal edges and positions; pasting is one transaction and reports what it had to skip. |
| Shell | `elements/shell.js`, `actions.js` | Selection (graph ids), one action registry (id, title, group, shortcut, enabled, run) that the palette, context menu, toolbar and keyboard all read. |
| App | `elements/app.js` | `<strata-app>`: regions from a JSON config, design tokens, theme (light, dark, or the OS preference), toasts, global shortcuts, the shortcuts overlay. |
| Canvas | `elements/canvas.js` | Hosts the graph and minimap; breadcrumb, page (view) tabs, zoom level, empty-state hint, error badges; drill-down transitions; a remembered viewport per system and page. |
| Panels | `library.js`, `tree.js`, `inspector.js`, `dock.js` | Library (search; drag or click to add; library systems by reference, as a copy, or opened), systems tree, inspector (properties by schema type, contracts, derived roll-ups, boundary ports), problems and console docks. |
| Overlays | `palette.js`, `menu.js` | Command palette (commands, add, find anywhere), context menu per target kind, toolbar with mode tabs. |
| Entry page | `app/` | Loads D3, creates `strata` with a sample "Checkout" project, mounts the workspace. `window.strata` is the full console API. |

Tests: the adapter in Node; the workspace in Chromium (`packages/ui/test/browser/app.browser.js`), driving the real page with mouse and keyboard: adding from the library, the inspector, drill-down and back, palette, context menu, find, drag and drop, connecting ports, theme, console, problems, tree, swapping a region, the shortcuts overlay.

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

Known gaps, kept for later: the Metrics, Comments and Links inspector tabs are placeholders (M6 fills comments and links; metrics arrive with simulation in R1); patterns in the library are R1.

## M4 Plugins: what exists

The plugin model of §7 and the starter library of §8, with the build, the CLI and the local server that carry them.

| Area | Where | Notes |
| --- | --- | --- |
| Module transform | `plugins/src/tokenize.js`, `modules.js` | Turns one ES module into a plain function for a small runtime. Every import and export form, `import.meta`, dynamic `import()` and JSON modules; strings, template literals, regexes and comments are tokenised so their contents are never mistaken for syntax. Line numbers are preserved. |
| Bundler | `bundle.js` | Resolves the graph from entries (relative imports, plus the vendored `d3` and `three` as globals), reports missing modules and exports and unsupported cycle bindings with an `E_BUNDLE_*` code, the file and the line, and emits IIFE or CommonJS scripts. The same code packs components and builds the app. |
| Minifier | `minify.js`, `rename.js` | Drops comments, indentation, and every space or line break the program cannot notice, keeping those semicolon insertion could depend on (tested over every file in the repository). With `rename`, which the build and the size gate use, it first gives local variables, parameters and private class members short names. Exports, properties, globals and the names of functions and classes keep theirs, and every package's tests pass on renamed sources. |
| Packer | `pack.js` | A component folder becomes a bundle `{ format, manifest, icon, modules, entry, assets, integrity }` and its `.strata.js`. Deterministic: the same folder gives the same bytes in any file order. `readBundle` reads a script back without evaluating it and refuses a changed bundle. |
| Validation | `manifest.js` | On top of the core's `checkManifest` (identity, API range, ports and what they expose, properties, state initial values, method latencies, metrics): a required API range, reserved `base:` ids, namespaces, templates and migrations, files the manifest names, explicit units, known keys with suggestions, icon hygiene, metric estimates. Every problem at once, as errors with `E_MANIFEST_` codes and warnings, with file and line. |
| Integrity | `sha256.js` | Synchronous SHA-256 in plain JavaScript, `sha256-<base64>` over a sorted-key JSON of the bundle. |
| Upload | `zip.js`, `upload.js` | Reads a dropped `.strata.js`, a zip (stored or deflated; encrypted, ZIP64 and oversized archives refused) or a folder's files, and packs them like `strata pack`. |
| Facade | `facade/src/components.js` | `strata.components.install`, `upload`, `pack`, `uninstall`, `bundle`, `versions`, `connectionTypes`, `list({ kind })`; a `components` event. Bundles are kept whole for the simulation worker (R1) and `.strata` exports (M5). |
| Local server | `strata-server` | `strata serve`: static files with a strict CSP, `/api/components`, each packed script, and server-sent events when folders change. Loopback only, local Host headers only, GET and HEAD only, no dotfiles. |
| CLI | `strata-cli` | `new component`, `pack` (`--out`, `--watch`, `--install`, `--all`), `validate`, `test-component`, `serve`, `repl`. Later commands say which release brings them. |
| Build | `scripts/build.js` | `npm run build`: `dist/strata.js` (global `Strata`, 408 KB minified against the 600 KB budget of §19), `dist/strata.cjs`, the packed starter library and `dist/strata.html`, which runs from `file://`. |
| Starter library (§8) | `components/`, `connection-types/` | 19 components and 6 connection types as plugin folders (manifest, icon, README), all declarative for now. |

Registration paths (§7): script tags in the offline page (`Strata.registerComponent`), the local server (`/api/components`, live reload), upload in the library panel (button or drop), and Node (`packFolder`, `strata repl`).

Tests: the packer, bundler and validation in Node (including bundling and running the whole facade from one CommonJS script); the server and CLI in process with temporary folders; in Chromium, the app with components from the server and live reload, every upload form, and the built `strata.html` opened from `file://` with a component scaffolded and installed by the CLI.

## Decisions in M4

**Bundling**
- **Imports are captured when a module starts, not live.** The runtime is a few lines and works in a page, a worker and Node. Each module registers its own export getters before its imports run, so across an import cycle hoisted function declarations and namespace imports behave exactly as native modules do (task 0005 checks this against Node's own loader). Any other binding crossing a cycle, and a reassigned exported `let`, would differ from native modules, so the bundler reports them (`E_BUNDLE_CYCLE`) instead.
- **Line numbers survive.** Removed import and export statements leave their line breaks and the generated header shares the first line, so errors in packed components point at the author's lines. The V8 syntax check in `strata validate` reports the author's line too.
- **Top-level await is not supported** in bundled modules (so `app/main.js` starts from a function).
- **The minifier renames only what it can prove it understands** (task 0119, which brought core back within its 250 KB). It works on tokens without a parser. Parameters and `const` and `let` declarations inside functions and blocks get short names, each within exactly the code that can see it. Anything ambiguous keeps its name: a label, a class member, a brace it cannot classify, a `for` body whose end it cannot place, `var`, `eval` or `with`. Top-level names, function and class declarations and the names functions take from their variables never change. Vendored Three.js is not renamed.

**Components**
- **Bundles carry a `format` field** (`strata-component@1`) so later formats can be told apart.
- **What goes into a bundle:** modules reachable from the entry and the migrations (unreached `.js` files are reported and left out), text assets, the icon. `tests/`, `package.json`, dotfiles and binary files stay out; binaries are reported.
- **Installing the same id and version again** does nothing when the bundle is identical and needs `{ replace: true }` otherwise (the local server and uploads replace; the console does not by default).
- **Connection types are plugins of kind `connection-type`** with a built-in abstract `base:connection` holding the common properties of §8. Their ids are plain (`http`, `db-protocol`) because port `accepts` lists and edges name them. Edge properties are validated against them, get their defaults, and are checked by the problems pass; values on an edge whose type is not installed are kept and reported once there are any.
- **Metric estimates.** Until simulation measures a metric, a manifest may name the property that estimates it: `"latency.p99": { "estimate": "serviceTime.p99" }`. Every starter component with a time distribution declares one, so latency roll-ups and contracts work at design time.
- **Path roll-ups follow synchronous edges only.** Critical path (latency), min path (throughput) and product (availability) describe a request; an asynchronous hand-off (an edge whose `mode` is `async`, e.g. `async-message`) ends it. Entry points are nodes nothing calls, so a consumer fed by a queue is off the request path rather than a path of its own.
- **Starter ids** are `starter.<folder>`; short names still work (`root.add('service')` prefers `starter.service` over `base:service`).
- **Migrations and behaviour code are not run on the page.** `strata test-component` loads them in a Node `vm` context without network, storage or Node APIs, with no string code generation, seeded randomness, a fixed clock and a time limit; the simulation worker (R1) uses the same runtime.

**Serving and the CLI**
- `strata serve` serves the repository (the development app at `/app/`) and redirects `/` there; its component directories default to `./components` and `./connection-types`, and `npm run serve` points them at the starter library.
- Uploads last for the session; M5 stores them in IndexedDB (and, when served, may write them to `components/`).
- `strata new project`, `script` and the R1/R2 commands answer with the milestone or release that brings them.
- The typecheck (`npm run typecheck`, TypeScript pinned as a dev dependency since task 0002) covers the browser and headless packages; the Node-only packages (`server`, `cli`) would need `@types/node`, which is not on the approved dev-dependency list of eng §16, so tests cover them.

Known gaps, kept for later: behaviour hooks run only in tests until the simulation worker (R1); migrations are loaded and checked by `strata test-component` but nothing runs them yet, because upgrading a node to a newer component version (with the property diff of §7) is still to come; binary assets are not bundled; the offline page does not persist anything yet (M5).

## Next: M5 Persistence

IndexedDB for projects, the op log and uploaded bundles; sessionStorage for per-tab state and crash recovery; `.strata` import and export (with pinned component bundles); File System Access save; the first-run storage checks of §17.
