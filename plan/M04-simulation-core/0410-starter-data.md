# 0410 Starter library: data stores

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

Relational DB, NoSQL DB, cache, object storage and search index, complete per spec §9.

## Tests to write first

Write these tests first, in `components/relational-db/tests`, `components/nosql-db/tests`, `components/cache/tests`, `components/object-storage/tests`, `components/search-index/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A row inserted by `insert` is returned by a later `query`
- [ ] Queries beyond max connections wait and appear as waiting connections
- [ ] LRU, LFU and TTL eviction evict the expected keys

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
