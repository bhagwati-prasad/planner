# 0402 Worker hosts, sandbox and protocol

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0401](../M04-simulation-core/0401-kernel.md), [0303](../M03-component-model-and-plugins/0303-behaviour-contract.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Sandbox
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md)
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

Blob-URL Web Worker and `worker_threads` hosts, stripped globals, the versioned `{ v, type, id, payload }` protocol with correlation and Transferables, and the heartbeat watchdog.

## Tests to write first

Write these tests first, in `packages/sim/test/host.test.js`, `tests/e2e/sandbox.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Inside the worker, `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB` and (after bootstrap) `importScripts` are undefined
- [ ] `Math.random` and `Date.now` return seeded and simulated values
- [ ] A method with an infinite loop is terminated after 2 s and the error names the method
- [ ] Messages with an unknown protocol version are rejected

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
