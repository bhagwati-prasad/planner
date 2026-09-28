# Benchmarks

`npm run bench` runs every `*.bench.js` here, or the files you name (`npm run bench -- tools/bench/graph-pan.bench.js`). It runs them in Chromium, the reference browser of eng §15, against the development server. `npm run check` does not run benchmarks; task 0805 adds tracking of regressions in CI.

A benchmark exports `bench({ browser, baseURL })`, which returns its measures as `{ name, value, unit, budget }`. The run fails when a measure is over its budget. `tools/test/bench.test.js` tests the runner.

| Benchmark | Measures | Budget |
| --- | --- | --- |
| `graph-pan.bench.js` | The 95th percentile main-thread time of a frame while panning 500 components and 480 edges (task 0207): from the frame's start until a message posted in it arrives, after style, layout and paint | 16 ms |

Numbers from a shared machine without a GPU vary from run to run. The budgets are set for the reference machine of eng §15.
