# 2. Non-negotiables

These twelve rules protect the architecture. Breaking one needs an ADR, not just a review approval.

- **The core never touches the DOM or browser globals. (lint)** Headless use in Node and the console depends on it.
- **Every model change is a command on the command bus.** This includes changes made by tests, importers and migrations.
- **The UI talks only to the facade. (lint)** No UI file imports `strata-core` internals.
- **No wall clock and no `Math.random` in core, sim, test, docs or plan code. (lint)** Use the injected clock, scheduler and PRNG.
- **Everything works from `file://`.** A feature that truly needs a server is marked served-only and degrades visibly when offline.
- **Zero runtime dependencies besides D3 and Three.js.** Both are vendored and pinned by integrity hash.
- **Every persisted format carries a schema version and a migration path.**
- **Every entity has a ULID and audit fields** (`createdBy`, `createdAt`, `updatedBy`, `updatedAt`, `rev`).
- **Built-in components use the public plugin API.** If a built-in needs something the API lacks, extend the API.
- **Simulation is deterministic.** The same model, scope, seed, edits, component versions and engine version always produce the same run hash.
- **Every component is runnable.** A component type is not done until it runs as a black box with realistic defaults, exposes typed state, and supports every step unit in the debugger.
- **Private stays private.** Only public methods are reachable over edges, at every level of recursion. The kernel enforces this; code never relies on convention.

---
Part of the [Strata Engineering Guidelines](README.md).
