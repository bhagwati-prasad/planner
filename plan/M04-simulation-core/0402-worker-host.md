# 0402 Worker hosts, sandbox and protocol

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0401](../M04-simulation-core/0401-kernel.md), [0303](../M03-component-model-and-plugins/0303-behaviour-contract.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Sandbox
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md)
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

Blob-URL Web Worker and `worker_threads` hosts, stripped globals, the versioned `{ v, type, id, payload }` protocol with correlation and Transferables, and the heartbeat watchdog.

## Tests to write first

Write these tests first, in `packages/sim/test/host.test.js`, `tests/e2e/sandbox.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Inside the worker, `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB` and (after bootstrap) `importScripts` are undefined
- [x] `Math.random` and `Date.now` return seeded and simulated values
- [x] A method with an infinite loop is terminated after 2 s and the error names the method
- [x] Messages with an unknown protocol version are rejected

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Where the tests are.** `packages/sim/test/host.test.js` runs the real worker bundle in `worker_threads`, with the fake scheduler for the watchdog. `tests/e2e/sandbox.spec.js` runs it from a Blob URL, from `file://` and served under the strict CSP. Both use the probe component in `packages/sim/test/fixtures/sandbox-probe/`. The watchdog is tested only in Node, since a browser test would need real timers.
- **Red for the browser tests.** They were written after the Node tests' implementation, so their red run was against a bootstrap without stripping, the simulated clock or sealing: the globals and the clock failed, as described. The worker already refused other protocol versions (0009), so that part passed from the start. What is new is that the host refuses a reply in another version.
- **Transferables.** A session test checks that replies move the buffers of their typed arrays.
- **Protocol.** The envelope `{ v, type, id, payload }` and version 1 are unchanged. The worker now also handles `load` (behaviour scripts, once per worker) and `call` (one public method at a simulated time with a seed, a unit-style injection), and posts a `heartbeat` naming the method before it starts one.
- **Stripped globals.** Besides spec §8's list, the worker removes `Worker` and `SharedWorker`, whose own globals would reach the network again. `new Date()` still reads the wall clock; spec §8 names `Date.now`, and eng §10's review rule covers `Date`.
- **Watchdog.** It names a method that hangs in a `call`, from the heartbeat that call posted. Heartbeats every 250 ms of wall time during a run, and naming a method that hangs inside a run, belong with method dispatch in 0403.
- **Renaming.** A bare `eval` token anywhere in a file stops the minifier from renaming it, and the worker bundle is one file, so the bootstrap evaluates with `scope.eval`, which is also indirect.
- **Worker bundle size.** The bundle's exception belonged to this task. The host, session and sandbox took it to 162.1 KB, so, as the human decided on 2026-09-29, the bundler now looks through modules made only of named re-exports (tests in `packages/plugins/test/bundler.test.js`). The worker carries five `core` modules and measures 28.9 KB of its 120 KB, and its exception is gone. Core, facade and the non-UI packages reach 263.8 KB, and their exception (owner 0418) rises to that, as the human decided on 2026-09-27.
- **Two WebKit fixes after the first CI run.** WebKit refuses to start a Blob-URL worker once it is offline, so the app's host starts its worker as the app boots again, as the pre-0402 host did; a test counts the workers started before any run. WebKit refuses `importScripts` of a Blob URL from a `file://` page, so there the bootstrap evaluates the same text with an indirect eval. A `file://` page has no CSP, and eng §16 notes the exception, as the human decided on 2026-09-29. A bootstrap test gives it a scope whose `importScripts` refuses as WebKit's does.
