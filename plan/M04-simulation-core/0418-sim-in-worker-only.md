# 0418 Simulation code only in the worker bundle

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0402](../M04-simulation-core/0402-worker-host.md) |

Proposed by 0401, as the human decided on 2026-09-29: it owns the exception that 0401 recorded for the core measure.

## Read first

- [Engineering §15 Performance budgets](../../docs/guidelines/engineering/15-performance-budgets.md)
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Worker protocol
- [Engineering §6 Architecture and dependency rules](../../docs/guidelines/engineering/06-architecture-and-dependency-rules.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md)

## Goal

In the browser, simulation code ships only in the worker bundle, which has its own eng §15 line. Today the facade imports strata-sim for its default in-process host, so strata-sim counts in the core measure as well as in the worker bundle, and the main-thread app bundle carries it although the app runs simulations in its Blob-URL worker. Here:

- The facade reaches the simulator only through the host it is given.
- Node and the tests pass the in-process host in.
- An ADR moves strata-sim from the core measure to the worker line.
- The core exception that 0401 recorded is removed.

## Tests to write first

Write these tests first. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] The offline app's main-thread bundle contains no strata-sim module (`tools/test/build.test.js`)
- [x] The facade runs a simulation in Node through the in-process host it is given (`packages/facade/test/sim.test.js`)
- [x] Core, facade and the non-UI packages measure under 255 KB, and pass without an exception for them (`tools/test/ci.test.js`, as it read before 0401)

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **The host and the protocol version moved.** The page's host, `createSimHost`, moved from strata-sim to the facade (`packages/facade/src/sim-host.js`). The protocol version moved to core as `SIM_PROTOCOL_VERSION`, which strata-sim's `PROTOCOL_VERSION` is. The page and the worker share it without importing each other. `packages/sim/test/host.test.js` now imports `createSimHost` from the facade.
- **No default host.** The facade has none. Without a `simHost`, `strata.sim.start` fails with `E_SIM_NO_HOST`, and the message says how to get one. Node scripts and tests pass strata-sim's `inProcessSimHost`. Neither the CLI's REPL nor the console demo runs simulations yet; `strata run` will pass a `worker_threads` host.
- **The development page** (`app/index.html`) loads `dist/sim-worker.js`, as the offline page does, so it needs `npm run build` once.
- **The facade test's first draft wrapped `inProcessSimHost`,** which did not exist yet, so it failed with a TypeError. It was changed before any code to wrap `handleMessage`, so that it failed as described: without a host, the facade still simulated.
- **The build test** lists the modules the bundler puts in the app's main-thread bundle. `scripts/build.js` exports `bundledModules(entry)` for it.
- **[ADR 0018](../../docs/adr/0018-simulation-code-ships-only-in-the-worker.md)** records the decision, and eng §15 notes it. Core, facade and the non-UI packages measure 253.2 KB of 255 KB, and the worker bundle 29.3 KB of 120 KB. No size exception is left.

