# 10. Plugins and components

These rules apply to built-in components and are published to external component authors.

## Manifests and versions

- `id` uses `vendor.name`; built-ins use `strata.<name>`.
- `strataApi` declares the supported plugin API range.
- Semver meaning for components:

| Change | Version bump |
| --- | --- |
| Behaviour fix, no schema change | Patch |
| New optional property, metric, port, state field or public method | Minor |
| Renamed or removed property, port, state field or public method; changed units, schemas or semantics | Major, with a migration in `migrations/` |

- A deprecated property carries `"deprecated": "Use deliveryDelay instead"` for at least one minor version before removal.

## State and methods

- Declare every state field with a type and an initial value. Code must not add undeclared fields; development builds reject them.
- Declare every public method with input and output schemas, errors and a cost model. A public method's return value is its response; errors go through `ctx.fail(code, details)`.
- Put internal operations under `private` and call them only with `ctx.call`. Declare a private method in the manifest when it has its own latency or should appear by name in docs.
- Methods may be `async`, but may await only promises returned by `ctx`. Awaiting anything else breaks determinism, and `strata validate` flags it.
- List on each port the public methods it exposes (`exposes`). A port with no exposed methods only sends.

## Behaviour code

- Use only `ctx`. Reading worker globals such as `self`, `postMessage` or `Date` fails review.
- Be deterministic: `ctx.now`, `ctx.random()` and `ctx.sample()` replace the clock and `Math.random`.
- **No module-level mutable state.** One worker hosts every instance of a component, so a module-level variable leaks between nodes.
- Keep `ctx.state` JSON-serialisable and bounded. The debugger snapshots it with `structuredClone` and shows at most 1,000 items per collection.
- Keep methods fast: aim for under 50 µs of real time per call. The watchdog terminates the run after 2 s without a heartbeat.

## What every component ships

- Units on every numeric property and metric, with realistic defaults.
- A README with purpose, property table, metrics, behaviour notes and the sources for default values.
- At least one self-test in `tests/`.
- An icon that follows the design system's component icon grid; `strata validate` checks it.

---
Part of the [Strata Engineering Guidelines](README.md).
