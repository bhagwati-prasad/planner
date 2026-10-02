# 0417 Run sessions on the facade

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0415](../M04-simulation-core/0415-edits-branches.md), [0416](../M04-simulation-core/0416-breakpoints-inspection.md), [0412](../M04-simulation-core/0412-scope-stubs.md), [0115](../M01-core/0115-facade.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Console API
- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md)
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Worker protocol
- [ADR 0025 Run sessions in the worker protocol](../../docs/adr/0025-run-sessions-in-the-worker-protocol.md)

## Goal

`strata.sim.start` and run handles with every control of spec §12, over ADR 0025's run sessions in the worker protocol, and `strata.sim.compare`. `strata.debug.*` and the cross-engine determinism suite are [0429](0429-facade-debug-determinism.md).

## Tests to write first

Write these tests first, in `packages/facade/test/sim.test.js` and `packages/sim/test/session.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] The spec §18 console example runs in Node in its R0 form, in a `worker_threads` worker: every line as written, with the starter library's names; the scenario line gives the run its requests instead; and the lines for later releases (`strata.test`, `strata.docs`, `strata.comments`, a scenario) fail with `UNSUPPORTED`, naming their release
- [x] A run handle has every control of spec §12, and each answers with the view of the moment it left the run at
- [x] The worker keeps runs by id: `run.start`, `run.control`, `run.read` and `run.close` (ADR 0025), with a heartbeat inside a long action and views while playing
- [x] `strata.help('sim')` lists every control with its signature

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Protocol.** ADR 0025, the human's decision: `run.start`, `run.control`, `run.read` and `run.close`, answered by `createRunSessions` (`packages/sim/src/sessions.js`) in the worker's session and in `createInProcessSimHost`. The protocol stays at version 1. Each run in a control's tree has its own id (`s1.run-2`). Only the current one moves; one that went on as a branch or was restarted keeps the moment it was left at.
- **Views.** Each control's reply is a plain view: status, position, speed, followed trace and frame, run tree, run-only edits and ways to continue, every component's state and the metric totals. `run.state(node)`, `run.edit(…)` and `strata.sim.compare(a, b)` read views without a round trip, as spec §18's example does; `compare` with a moment asks the worker. Reads come in `run.data` chunks of at most 64 KB; views are not chunked yet. The §18 example's views are a few KB.
- **Ready runs.** Spec §18's example steps a run it has just started. Stepping, seeking and running to the end play and pause a ready run first, and pause a playing one, in one task in the worker, so no frame plays between. These are moves of spec §12's diagram, not new ones. Followed hops follow the first request when none is followed.
- **Planning on the page.** `planModel` moved from strata-sim into core: it reads the model, so the page plans runs, and the worker gives each component its behaviour by `id@version` (`withBehaviours`). The facade loads every installed component's behaviour script before the first run that needs one; a component installed later starts a fresh worker, since a worker loads code once (spec §8).
- **Worker adapters.** The worker's scheduler and wall clock come from `workerAdapters(scope)` in the bootstrap, taken before the sandbox makes `performance.now` simulated time. Playing runs use them; heartbeats go out every 250 ms of wall time inside a long action, and views at most every 100 ms while playing.
- **R0 form of the example.** The human chose it: the starter service gets an endpoint that inserts into the database and connects through `out` (it has no `db` port), the database keeps rows in `tables.orders`, and requests stand in for the `checkout` scenario (R1). `strata.test`, `strata.comments` and `strata.docs`, and a scenario, fail with `UNSUPPORTED`, naming their release. Spec §18's example now says so.
- **The skeleton.** The human chose to rename the walking skeleton's single request to `strata.sim.once`; the UI's Run button and the five skeleton tests changed only that name.
- **Bandwidth bug.** The base connection type kept `bandwidth` in Mbps (1000), while eng §8 and the kernel use bits per second, so a 4 KB message took 32 s to cross an edge planned from the model. It is now 1,000,000,000 bps. The starter components that keep their own bandwidth in Mbps or Gbps convert it in their own code. The inspector shows the raw `bps` value until it formats units.
- **Budgets.** ADR 0026, the human's decision: core 265 KB (263.7 KB now), strata-ui 220 KB, the worker 160 KB (149.9 KB now). The worker now carries whole runs and the core modules they need. Core has 1.3 KB left for 0429's `strata.debug`.
- **Tests I corrected before green.** The help signatures, which the generator writes from each method's JSDoc types; the inserted rows, which are keyed in the order the service finished the orders; and step into, which enters the database's private call first, since 0414 follows the call chain.
