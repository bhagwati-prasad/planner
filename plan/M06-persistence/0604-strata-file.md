# 0604 The .strata file format

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M06 Persistence](../ROADMAP.md#m06-persistence) | R0 | todo | [0601](../M06-persistence/0601-idb-adapter.md), [0302](../M03-component-model-and-plugins/0302-registry.md) |

## Read first

- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md): The .strata file
- [Engineering §8 Data, identifiers, units and time](../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md)
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md): Input handling

## Goal

Export and import of `.strata` files: stable key order, optional gzip, embedded pinned bundles, schema migrations, and size and depth limits.

## Tests to write first

Write these tests first, in `packages/storage/test/strata-file.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Exporting and re-importing the recursive fixture gives the same state hash
- [ ] A file above 50 MB, deeper than 64 levels or with a 1 MB+ string is refused before loading
- [ ] A schemaVersion 1 fixture migrates on import
- [ ] A project imports on a machine without its components installed, using the embedded bundles

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
