# 0429 strata.debug and the cross-engine determinism suite

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0417](../M04-simulation-core/0417-facade-sim.md) |

## Read first

- [Spec §13 Debugger](../../docs/spec/13-debugger.md)
- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Console API
- [Engineering §18 Testing](../../docs/guidelines/engineering/18-testing.md)
- [ADR 0024 strata-debug ships in the worker](../../docs/adr/0024-strata-debug-ships-in-the-worker.md)
- [ADR 0025 Run sessions in the worker protocol](../../docs/adr/0025-run-sessions-in-the-worker-protocol.md)

## Goal

`strata.debug.*` over the worker protocol, with strata-debug bundled into the worker, and the cross-engine determinism suite. Split from 0417 by the human.

## Tests to write first

Write these tests first, in `packages/facade/test/debug.test.js`, `tests/e2e/determinism.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] `strata.debug.*` sets breakpoints and inspects hops, the method stack, state and effective properties of a run in a `worker_threads` worker, with roll-up as a source
- [x] The recursive fixture's checkout run has the same hash in Node, Chromium, Firefox and WebKit
- [x] `strata.help('debug')` lists every debugger command with its signature

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **strata.debug.** `run`, `attach(run)`, `setBreakpoint(spec)`, `clearBreakpoints()`, `hops(trace)`, `methodStack()`, `state(node)` and `effectiveProps(node)`, on the latest run started unless one is attached. Run handles take `setBreakpoint` and `clearBreakpoints` too, as spec §18 says. The debugger is no longer a planned namespace.
- **In the worker.** strata-debug's `debugExtensions` add the debugger's breakpoints and reads to strata-sim's run sessions, which now take extensions. The human chose to move the worker's entry to strata-debug (`src/worker.js`), the top package in the worker, since eng §6 lets strata-sim import only core. strata-sim's `startWorker` starts the worker. The build and the size check use the new entry; the committed size test that builds a fixture worker changed only its entry's path. The in-process host takes the same extensions.
- **Roll-up beside the value.** The human chose it: a run uses a composite's black-box model, never its roll-ups (spec §7), so effective properties keep the run's value and source and add `rollup`, what the inner system rolls up to. A distribution rolls up by its statistics, `{ median, p99 }`.
- **The determinism suite.** `tests/e2e/determinism.spec.js` plans the recursive fixture's Checkout from the model, gives Payments 40 authorisations and refunds, with lognormal service times on the payment service and the ledger API, and compares the run hash in Node with the hash in the browser's worker, from file:// and served. It passed on its first run in Chromium: 0417's run sessions already carry everything it needs, and Node and Chromium share V8. Firefox and WebKit run it in CI.
- **Without a scheduler.** An in-process host given no scheduler now leaves a playing run where it is, instead of failing, so stepping and running to the end from a ready run work in scripts.
- **Tests I corrected before green.** The debugger test first followed the first order sent, but the breakpoint pauses on whichever order the service finished first; then it expected the insert on the stack, but the database's `insert` returns at once and only delays its response, so the gateway now stands in front, waiting for the service, which waits for the database. The help signatures follow the generator.
- **Budgets.** Core is 264.9 KB of its 265 KB, after shortening help summaries and messages; the next facade work needs room. The help metadata is 24.3 KB of 25 KB, and the worker 155.0 KB of 160 KB.
