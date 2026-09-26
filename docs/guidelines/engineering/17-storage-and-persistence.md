# 17. Storage and persistence

- All persistence goes through the storage adapter. UI code never touches IndexedDB, sessionStorage or localStorage directly. **(lint)**
- IndexedDB database `strata` has the object stores `projects`, `entities`, `oplog`, `snapshots`, `bundles`, `runs` and `meta`. Version upgrades in `onupgradeneeded` are migrations and are tested like file migrations.
- **Write-ahead log:** after a command commits in memory, it is appended synchronously to the tab's sessionStorage log (`strata:wal:<tabId>`). It is then flushed to IndexedDB in one transaction per batch, and cleared. The log stays under 1 MB; reaching the limit forces a flush.
- On startup, unflushed log entries are replayed before the UI becomes interactive.
- `QuotaExceededError` shows a blocking banner with an export action. Data is never dropped silently.
- **Multi-tab:** a Web Lock named `strata:project:<id>` guards writes. A second tab opens the project read-only, with an option to take over.
- **Node adapter:** writes are atomic (write to a temporary file, then rename).

---
Part of the [Strata Engineering Guidelines](README.md).
