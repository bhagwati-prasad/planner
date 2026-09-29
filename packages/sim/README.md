# strata-sim

Discrete-event simulation kernel, method dispatch, scopes and stubs, snapshots, the run tree, chaos and metrics.

- Runs in: Web Worker, `worker_threads`
- Specification: spec §11, §12
- Built in: M04 (tasks 0401–0417) (see `plan/ROADMAP.md`)
- Entry point: `src/index.js`, the only file other packages may import (eng §4)

So far, the kernel (task 0401) and the walking skeleton (task 0009):

- `Kernel` and `EventQueue`: integer-microsecond simulated time, with events ordered by `(timeUs, priority, seq)` (eng §13). Simultaneous events run in the order they were scheduled. The queue pools its entries: the entry `pop` returns is the caller's until the next `pop`, which takes it back for a later `push`, so a run allocates no queue entries once the queue has reached its depth.
- `createStreams(seed)`: one xoshiro128** stream per component, seeded through splitmix32 from the seed and a hash of the component id, so adding a component never changes another component's stream.
- `log(x)` and `exp(x)`: ports of fdlibm's e_log.c and e_exp.c (as V8 carries them, with its exact `exp(1)`), made of IEEE 754 arithmetic alone, so they return the same bits in every engine. They are for distribution sampling, which `ctx.sample` brings in task 0403, in place of `Math.log` and `Math.exp`, which may differ in the last bit between engines (eng §13). `test/fixtures/log-exp-vectors.json` holds the reference vectors.
- `tools/bench/kernel.bench.js` measures simple events per second in Chromium against the 200,000 of eng §15.
- `simulate(input)`: one request from a client to a service over one edge, with fixed latencies. It returns the trace, the response and the run hash (`runHash`, SHA-256 from core).
- `handleMessage(message)`: the worker protocol, `{ v, type, id, payload }`.
- `src/worker/main.js`: the worker entry. `npm run build` bundles it into `dist/sim-worker.js`, which a `file://` page starts from a Blob URL. Node runs the same bundle in `worker_threads`.
