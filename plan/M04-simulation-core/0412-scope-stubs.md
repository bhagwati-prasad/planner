# 0412 Scopes, stubs and inbound traffic

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0406](../M04-simulation-core/0406-black-box-expanded.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Scope
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Method dispatch, scope and stubs

## Goal

The scope resolver (whole project, one system, selection, request path); fixed, recorded and black-box stubs; recorded inbound traffic.

## Tests to write first

Write these tests first, in `packages/sim/test/scope.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A selection scope instantiates only the selected components
- [x] A fixed stub answers with its configured latency distribution and error rate
- [x] A recorded stub replays responses from a wider run; an unmatched call fails with `E_STUB_NO_RECORDING`
- [x] A request-path scope contains exactly the components a first trace run touched

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Where.** `planRun` takes `scope` and `stubs` and returns `inbound` beside `nodes` and `edges`. A selection names components by run path. A system scope names its composite, which runs expanded. `requestPath(spans)` turns a trace run into a selection, adding the composites its requests passed through, since an expanded composite has no span of its own.
- **Stubs.** One stub node per edge leaving the scope, `stub:<edge id>`, with the port the edge reaches, as runComponent's `stub:<port>` is named, so recordings and configuration stay per edge. With no configuration, a stub answers `null` at once. A fixed stub's response is returned as is; templating waits for scenario variables (0801). A black-box stub plans the outside component as a black box, without its edges, so a leaf's own downstream calls fail with `E_SIM_NO_EDGE`.
- **Recording.** `createRun({ record: true })` keeps every message that reached a component over an edge, with its arrival time, and each request's response and when it left, in `run.recordings` by edge id. Each retry attempt is its own entry. A recorded stub replays each response after as long as it took at the far end, so a scoped run answers at the same times as the wider run.
- **Inbound.** `replayInbound` injects recorded messages straight into the component at the end of each inbound edge, at their arrival times after the run's current time. Driving inbound edges from a scenario uses a client component in scope (0428). Saving a scope with its scenario comes with the facade (0417) and scenarios (0801).
