# strata-sim

Discrete-event simulation kernel, method dispatch, scopes and stubs, snapshots, the run tree, chaos and metrics.

- Runs in: Web Worker, `worker_threads`
- Specification: spec §11, §12
- Built in: M04 (tasks 0401–0417) (see `plan/ROADMAP.md`)
- Entry point: `src/index.js`, the only file other packages may import (eng §4)

So far, the walking skeleton (task 0009):

- `Kernel` and `EventQueue`: integer-microsecond simulated time, with events ordered by `(timeUs, priority, seq)` (eng §13).
- `createStreams(seed)`: one xoshiro128** stream per component, seeded through splitmix32.
- `simulate(input)`: one request from a client to a service over one edge, with fixed latencies. It returns the trace, the response and the run hash (`runHash`, SHA-256 from core).
- `handleMessage(message)`: the worker protocol, `{ v, type, id, payload }`.
- `src/worker/main.js`: the worker entry. `npm run build` bundles it into `dist/sim-worker.js`, which a `file://` page starts from a Blob URL. Node runs the same bundle in `worker_threads`.
