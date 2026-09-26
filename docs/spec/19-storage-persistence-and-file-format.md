# 19. Storage, persistence and file format

Projects live in browser storage until the user deletes them, and move between machines as a single `.strata` file. Each browser store is used for what it does well: IndexedDB for durable project data, sessionStorage for per-tab working state, and localStorage for small preferences.

| Store | Holds | Why |
| --- | --- | --- |
| IndexedDB | Projects, systems, views, docs, tickets, tests, comments, op log, model snapshots, uploaded component bundles, runs and run branches with their snapshots | Durable, large, asynchronous; survives restarts until deleted |
| sessionStorage | Open project id, breadcrumb path, panel layout, selection, undo pointer, a buffer of unflushed commands | Per tab, so two tabs keep independent context; cleared when the tab closes; about 5 MB and synchronous, so it holds only small state |
| localStorage | Theme, shortcuts, local identity profile, recent files | Small, shared across tabs |

## Durability

- Every command is written to the sessionStorage buffer first, then flushed to IndexedDB within 500 ms. A crashed tab recovers unflushed commands on reload.
- On first run Strata calls `navigator.storage.persist()` to reduce the risk of eviction and shows quota use from `navigator.storage.estimate()`.
- Other tabs are notified of changes through `BroadcastChannel`; the Web Locks API prevents two tabs writing the same project at once.
- Deleting a project requires confirmation and offers a final export.

## The .strata file

A `.strata` file is JSON, optionally gzip-compressed with `CompressionStream`. It contains everything needed to open the project anywhere, including pinned component bundles, so it works on a machine without those components installed.

```json
{
  "format": "strata",
  "schemaVersion": 1,
  "project": { "id": "01J...", "name": "Checkout", "rootSystemId": "01J..." },
  "systems": [], "views": [], "annotations": [],
  "scenarios": [], "tests": [], "docs": [], "tickets": [],
  "threads": [], "identities": [],
  "components": { "acme.message-queue@1.2.0": { "integrity": "sha256-...", "bundle": "..." } },
  "runs": [],
  "oplog": { "included": false }
}
```

Run results and the op log are optional in exports to keep files small. Schema migrations upgrade older files on open.

## Saving to disk

In Chromium browsers, the File System Access API allows Save and Save As directly to a chosen file, including from `file://`. Other browsers fall back to download and upload. A gentle reminder appears when a project has not been exported for 7 days.

## The file:// caveat

Browsers scope storage by origin. Chromium treats all `file://` pages as one origin, so projects persist as expected. Firefox can isolate storage per file path, so moving `strata.html` there can hide existing projects until it is moved back; Strata warns about this on first run.

## Later formats

- **R3 project folder:** one file per system, view, doc and ticket, with stable key order and positions kept in view files, to minimise git merge conflicts.
- **R4+:** the server is authoritative and IndexedDB becomes an offline cache that syncs on reconnect.

Size target: a project with 2,000 nodes and 200 docs stays under 20 MB uncompressed.

---
Part of the [Strata Product and Technical Specification](README.md).
