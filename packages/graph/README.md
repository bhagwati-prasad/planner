# strata-graph

The generic D3 diagram library: it renders graph data and emits intents, and knows nothing about Strata. Only `src/dom/` touches the DOM.

- Runs in: Browser (headless parts in Node)
- Specification: spec §10
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`
