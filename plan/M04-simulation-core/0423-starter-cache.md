# 0423 Starter library: cache

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0422](../M04-simulation-core/0422-starter-nosql-db.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The cache, complete per spec §9: capacity in memory and items, LRU, LFU, TTL and random eviction, expiry, hit latency, nodes and replication, and its write policies.

## Tests to write first

Write these tests first, in `components/cache/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] LRU, LFU and TTL eviction evict the expected keys

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided. It keeps 0410's eviction test.
