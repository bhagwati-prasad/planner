# strata-core

The headless core: entity store, command bus, undo and redo, the operation log, events, queries, validation, the recursion resolver and the roll-up engine.

- Runs in: Main thread, worker, Node
- Specification: spec §5–§7
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`
