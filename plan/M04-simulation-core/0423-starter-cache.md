# 0423 Starter library: cache

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0422](../M04-simulation-core/0422-starter-nosql-db.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The cache, complete per spec §9: capacity in memory and items, LRU, LFU, TTL and random eviction, expiry, hit latency, nodes and replication, and its write policies.

## Tests to write first

Write these tests first, in `components/cache/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] LRU, LFU and TTL eviction evict the expected keys

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided. It keeps 0410's eviction test.
- **Done (2026-10-01).** The tests are in `components/cache/tests/cache.test.js` and `math.test.js`. Beyond the listed one, they cover random eviction, expiry and delete, hit ratio under access skew, the three write policies and a failing origin, memory with replicas and fill, and that every method, error and metric is exercised.
- **Model.**
  - The cache gains an `origin` out port for its write policies, and writes there only when it is connected (`ctx.targets`, ADR 0022).
  - A get without a key is synthetic load drawn by Zipf's law; its powers come from a copy of the NoSQL DB's deterministic `math.js`.
  - A set evicts before it inserts. The first implementation inserted first, so LFU evicted the new entry; the memory test's expectation changed with it, so memory never passes capacity.
  - `nodes` do not split capacity yet.
- **Test change.** As the human approved on 2026-10-01, 0407's "simulate a manifest with extends and no entry without any code" drops the starter cache's new `entry` before running it, and asserts that the manifest extends base:cache instead of having no entry. Its set and get assertions, and its message-queue part, are unchanged.
