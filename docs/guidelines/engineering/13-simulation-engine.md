# 13. Simulation engine

The kernel is the most performance-sensitive and correctness-sensitive code in Strata.

- **Event ordering:** the queue orders events by `(timeUs, priority, seq)`. `seq` is a monotonically increasing insertion counter, so simultaneous events always resolve in the same order.
- **Integer time:** all kernel times are integer microseconds. Distribution samples are rounded to the microsecond before scheduling.
- **Randomness:** xoshiro128** streams, seeded through splitmix32 from the run seed combined with a hash of each node id. Adding a node never changes another node's stream.
- **Cross-engine determinism:** distribution sampling uses in-house deterministic `log` and `exp` (an fdlibm port) instead of `Math.log` and `Math.exp`. Run hashes therefore match across V8, SpiderMonkey and JavaScriptCore.
- **Allocation-free hot loop:** event objects are pooled and metric buckets are typed arrays.
- **Run hash:** SHA-256 over the model revision hash, component integrity hashes, seed, settings, engine version and a digest of the results.
- **Worker protocol:** every message is `{ v, type, id, payload }`, where `v` is the protocol version and `id` correlates requests with responses. Large arrays travel as Transferables.
- **Streaming:** results are posted in chunks of at most 64 KB, at most every 100 ms of wall time.
- **Benchmarks:** `tools/bench/sim-*.js` run in CI. A drop of more than 10% in events per second against `main` fails the build.

## Snapshots, stepping and branches

- Snapshots capture all component state, pending events and PRNG positions every 10,000 events and at every pause. They are structural copies, never live references.
- Stepping back and scrubbing restore the nearest earlier snapshot and replay forward deterministically. Stepping forward n then back n must restore an identical state hash; a property test enforces this.
- Snapshot memory is capped per run (256 MB by default). Older snapshots are thinned, which makes distant seeks slower but never inexact.
- A branch run stores its parent id, branch point and edit list. It shares its parent's snapshots up to the branch point instead of copying them.
- Edits to a paused run live in a run-override layer over the model revision. They become model commands only when the user chooses Keep in model.
- A branch's run hash covers its parent's hash, branch point and edits, so branches are as reproducible as fresh runs.

## Method dispatch, scope and stubs

- The kernel routes edge traffic only to public methods exposed on the receiving port, and into expanded composites only through their bindings.
- Promises returned by `ctx` are resolved by kernel events in queue order, never by microtasks the kernel does not control.
- The scope resolver produces the exact set of components and edges that run. Nothing outside it is instantiated.
- Every edge leaving the scope gets a stub before the run starts. Recorded stubs replay responses matched by method and call order; an unmatched call fails with `E_STUB_NO_RECORDING`.
- Recorded inbound traffic replays with its original simulated timestamps, offset to the run's start.

---
Part of the [Strata Engineering Guidelines](README.md).
