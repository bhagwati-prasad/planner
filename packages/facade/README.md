# strata-facade

The public `strata` API (`createStrata(adapters)`), composed from the packages below it. The environment passes the adapters at startup (eng §6), with a clock at least: `app/adapters.js` in the browser, `packages/cli/src/adapters.js` in Node, the fakes in `tools/testing` in tests. Every client (the UI, the browser console, the CLI) talks only to this.

- Runs in: Main thread, Node
- Specification: spec §18
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`
