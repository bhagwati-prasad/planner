# 6. Architecture and dependency rules

Dependencies point downward only. The import-boundary lint rule reads this table. **(lint)**

| Package | May import |
| --- | --- |
| core | nothing |
| plugins, storage, comments, docs, plan | core |
| sim | core |
| debug, test | sim, core |
| facade | core, plugins, storage, sim, debug, test, docs, plan, comments |
| graph | d3 only; never any Strata package |
| 3d | three only |
| ui | facade, graph, 3d |
| cli | facade, storage, server |
| server | facade, plugins, storage |

## Banned globals

In `core`, `sim`, `debug`, `test`, `docs`, `plan`, `comments` and `facade`, these globals are banned: `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, `fetch`, `XMLHttpRequest`, `setTimeout`, `setInterval`, `Date.now`, `new Date()` without an argument, `performance.now`, `Math.random` and `console`. **(lint)**

Each banned capability comes from an injected adapter: clock, scheduler, PRNG, id generator, logger, storage, sandbox host, transport and AI provider.

## Adapters

- Every adapter has a JSDoc interface in `core/src/types.js`.
- Every adapter interface has a contract test suite in `tools/contracts/`. Each implementation must pass it: the storage contract runs against IndexedDB in a browser and against the filesystem in Node.
- Adapters are passed to `createStrata(adapters)` once, at startup. Nothing reaches for a global instance.

---
Part of the [Strata Engineering Guidelines](README.md).
