# 0429 strata.debug and the cross-engine determinism suite

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0417](../M04-simulation-core/0417-facade-sim.md) |

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

- [ ] `strata.debug.*` sets breakpoints and inspects hops, the method stack, state and effective properties of a run in a `worker_threads` worker, with roll-up as a source
- [ ] The recursive fixture's checkout run has the same hash in Node, Chromium, Firefox and WebKit
- [ ] `strata.help('debug')` lists every debugger command with its signature

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
