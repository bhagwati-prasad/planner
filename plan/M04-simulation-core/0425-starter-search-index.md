# 0425 Starter library: search index

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0424](../M04-simulation-core/0424-starter-object-storage.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The search index, complete per spec §9: shards and replicas, documents searchable only after a refresh, indexing throughput and lag, query latency, rejections under load, index size and heap.

## Tests to write first

Write these tests first, in `components/search-index/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A document indexed is found by `search` only after the next refresh

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided.
- **Done (2026-10-01).** The tests are in `components/search-index/tests/search-index.test.js`. Beyond the listed one, they cover the indexing throughput and lag, rejections from the indexing buffer, matching and ranking, deletes at refresh, merges and index size, and that every method, error and metric is exercised.
- **Model.**
  - The indexing buffer is a tenth of the heap, Elasticsearch's default `index_buffer_size`.
  - Merges run every tenth refresh.
  - A search waits for the slowest shard.
  - `replicas` change nothing yet.
