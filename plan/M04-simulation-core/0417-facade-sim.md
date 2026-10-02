# 0417 Run sessions on the facade

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0415](../M04-simulation-core/0415-edits-branches.md), [0416](../M04-simulation-core/0416-breakpoints-inspection.md), [0412](../M04-simulation-core/0412-scope-stubs.md), [0115](../M01-core/0115-facade.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Console API
- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md)
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Worker protocol
- [ADR 0025 Run sessions in the worker protocol](../../docs/adr/0025-run-sessions-in-the-worker-protocol.md)

## Goal

`strata.sim.start` and run handles with every control of spec §12, over ADR 0025's run sessions in the worker protocol, and `strata.sim.compare`. `strata.debug.*` and the cross-engine determinism suite are [0429](0429-facade-debug-determinism.md).

## Tests to write first

Write these tests first, in `packages/facade/test/sim.test.js` and `packages/sim/test/session.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The spec §18 console example runs in Node in its R0 form, in a `worker_threads` worker: every line as written, with the starter library's names; the scenario line gives the run its requests instead; and the lines for later releases (`strata.test`, `strata.docs`, `strata.comments`, a scenario) fail with `UNSUPPORTED`, naming their release
- [ ] A run handle has every control of spec §12, and each answers with the view of the moment it left the run at
- [ ] The worker keeps runs by id: `run.start`, `run.control`, `run.read` and `run.close` (ADR 0025), with a heartbeat inside a long action and views while playing
- [ ] `strata.help('sim')` lists every control with its signature

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
