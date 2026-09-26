# 21. Facade and console API design

The console API is a public API. It follows the same review and versioning rules as the plugin API.

- **Verbs for actions:** `add`, `remove`, `update`, `connect`, `disconnect`, `openAsSystem`, `extract`, `inline`, `enter`, `start`, `play`, `pause`, `stop`, `restart`, `runToEnd`, `stepForward`, `stepBack`, `seek`, `edit`, `replayFromHere`, `render`, `export`. Nouns for queries, such as `methods()` and `state()`.
- **Handles:** methods such as `root.add()` return thin handles that hold only an id and re-read state on every access, so they never go stale.
- **Sync or async:** pure queries are synchronous. Anything that touches storage, a worker or the network returns a promise.
- **Plain data out:** handles implement `toJSON()`; collections implement `toTable()` for `console.table`.
- **Stability tiers:** `@stable`; `@experimental`, exposed under `strata.experimental`; and `@internal`, never exposed on the facade.
- **Deprecation:** warn once per session and name the replacement. Remove experimental APIs after one minor release and stable APIs in the next major release.

---
Part of the [Strata Engineering Guidelines](README.md).
