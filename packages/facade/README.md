# strata-facade

The public `strata` API (`createStrata()`), composed from the packages below it. Every client (the UI, the browser console, the CLI) talks only to this.

- Runs in: Main thread, Node
- Specification: spec §18
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`
