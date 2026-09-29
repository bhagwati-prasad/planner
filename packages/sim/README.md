# strata-sim

Discrete-event simulation kernel, method dispatch, scopes and stubs, snapshots, the run tree, chaos and metrics.

- Runs in: Web Worker, `worker_threads`
- Specification: spec §11, §12
- Built in: M04 (tasks 0401–0417) (see `plan/ROADMAP.md`)
- Entry point: `src/index.js`, the only file other packages may import (eng §4)

So far, the kernel (task 0401), the worker's host and sandbox (task 0402) and the walking skeleton (task 0009):

- `Kernel` and `EventQueue`: integer-microsecond simulated time, with events ordered by `(timeUs, priority, seq)` (eng §13). Simultaneous events run in the order they were scheduled. The queue pools its entries: the entry `pop` returns is the caller's until the next `pop`, which takes it back for a later `push`, so a run allocates no queue entries once the queue has reached its depth.
- `createStreams(seed)`: one xoshiro128** stream per component, seeded through splitmix32 from the seed and a hash of the component id, so adding a component never changes another component's stream.
- `log(x)` and `exp(x)`: ports of fdlibm's e_log.c and e_exp.c (as V8 carries them, with its exact `exp(1)`), made of IEEE 754 arithmetic alone, so they return the same bits in every engine. They are for distribution sampling, which `ctx.sample` brings in task 0403, in place of `Math.log` and `Math.exp`, which may differ in the last bit between engines (eng §13). `test/fixtures/log-exp-vectors.json` holds the reference vectors.
- `tools/bench/kernel.bench.js` measures simple events per second in Chromium against the 200,000 of eng §15.
- `simulate(input)`: one request from a client to a service over one edge, with fixed latencies. It returns the trace, the response and the run hash (`runHash`, SHA-256 from core).
- `handleMessage(message)`: the worker protocol, `{ v, type, id, payload }`, for `run`.
- `src/worker/main.js`: the worker entry. `npm run build` bundles it into `dist/sim-worker.js`, which a `file://` page starts from a Blob URL. Node runs the same bundle in `worker_threads` (strata-server's `spawnThreadWorker`).
- `src/worker/bootstrap.js`: the sandbox (spec §8). Before any component loads it removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB` and `caches`, and `Worker` and `SharedWorker`, whose own globals would reach them. It deletes each from the prototypes that provide it too. `Math.random` becomes the seeded stream of the component that runs, and `Date.now` and `performance.now` return simulated time in ms. Component behaviours arrive as script text (strata-plugins' `behaviourScript`) and load through a Blob URL with `importScripts`, which the strict CSP allows. After that it removes `importScripts`, before any behaviour module runs. It is the one file allowed to evaluate code (eng §16).
- `createWorkerSession({ post, sandbox })` (`src/worker/session.js`): what the worker does with each message. `load` evaluates behaviour scripts, once per worker. `call` runs one public method of a loaded component at a simulated time with a seed, as a unit-style injection (spec §11); it posts a heartbeat naming the method before it starts. Replies move the buffers of their typed arrays as Transferables.
- The page's side of the worker, `createSimHost({ spawn, scheduler })`, is in the facade (`packages/facade/src/sim-host.js`), so the main thread carries no simulation code; strata-sim ships only in the worker bundle (ADR 0018). It starts a worker with the `spawn` it is given, pairs each reply with its request by `id`, and refuses a worker that speaks another protocol version. Its watchdog, on the injected scheduler, stops a worker that stays silent for 2 s while requests wait, and rejects them with `E_SIM_METHOD_HUNG`, naming the method the last heartbeat said had started. The next request starts a fresh worker. The app's host (`app/sim-host.js`) spawns Blob-URL Web Workers.
- `inProcessSimHost`: runs the kernel in the calling thread, with no sandbox or watchdog, for Node scripts and tests (`createStrata({ simHost: inProcessSimHost })`).
- `PROTOCOL_VERSION` is core's `SIM_PROTOCOL_VERSION`, which the facade's host reads too.

The worker names a hung method only for a `call`, which says which method it starts. The heartbeat of a run, every 250 ms of wall time between kernel events, and naming a method that hangs inside a run come with method dispatch (task 0403).
