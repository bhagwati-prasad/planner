# strata-server

The local server behind `strata serve`: static files under a strict CSP, component discovery and live reload.

- Runs in: Node
- Specification: spec §8, §21
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`
