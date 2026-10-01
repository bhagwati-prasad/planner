# strata-cli

The `strata` command: `new component`, `pack`, `validate`, `test-component`, `serve` and `repl`.

- Runs in: Node 20+
- Specification: spec §8, §18
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`

## Components

- **`strata new component <name>`** writes a component folder in the behaviour API of spec §8:
  - a public method `handle` that the `in` port exposes;
  - a state field and a metric;
  - a self-test that uses the behaviour test context.
- **`strata validate <dir>`** packs the folder and reports every problem at once:
  - the manifest;
  - the icon rules of design system §13: a `0 0 24 24` viewBox, vector paths only with no raster image or script, and under 4 KB;
  - the behaviour contract: hooks, and public methods as the manifest declares them;
  - determinism: module-level mutable state, and awaits on anything but a promise from `ctx`, with the file and line.
- **`strata test-component <dir>`** loads the behaviour in a sandbox, checks it against the manifest, and runs `tests/*.test.js` with `node --test`. Self-tests import the test context, or `runComponent` to run the component in the kernel with simulated time and servers (ADR 0020), as `strata/testing`. Both come from strata-sim, which the CLI may import in Node (eng §6):

  ```js
  import { createTestContext, runComponent } from 'strata/testing'
  const ctx = createTestContext({ manifest, behaviour })
  const api = runComponent({ manifest, behaviour, props: { instances: 2, concurrency: 4 } })
  ```
