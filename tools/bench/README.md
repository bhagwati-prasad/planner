# Benchmarks

`npm run bench` runs every `*.bench.js` here, or the files you name (`npm run bench -- tools/bench/graph-pan.bench.js`). It runs them in Chromium, the reference browser of eng §15, against the development server. `npm run check` does not run benchmarks; task 0805 adds tracking of regressions in CI.

A benchmark exports `bench({ browser, baseURL })`, which returns its measures as `{ name, value, unit, budget }`. The run fails when a measure is over its budget, or under it for a throughput, which says `better: 'higher'`. `tools/test/bench.test.js` tests the runner.

| Benchmark | Measures | Budget |
| --- | --- | --- |
| `graph-pan.bench.js` | The 95th percentile main-thread time of a frame while panning 500 components and 480 edges (task 0207): from the frame's start until a message posted in it arrives, after style, layout and paint | 16 ms |
| `kernel.bench.js` | Simple events the simulation kernel handles per second (task 0401): a thousand components, each rescheduling itself after a delay drawn from its random stream, best of three runs of a million events | 200,000 events/s |

Numbers from a shared machine without a GPU vary from run to run. The budgets are set for the reference machine of eng §15.
