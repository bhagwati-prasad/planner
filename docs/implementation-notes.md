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

## Next: M2 strata-graph

The D3 diagram library (§9): shapes, ports, edges, zoom, selection, frames and export, with no knowledge of Strata. It renders and captures gestures, emits intents, and never owns state; a view adapter in `strata-ui` (M3) maps the model to graph data and intents back to commands. D3 modules are vendored locally for the offline build.
