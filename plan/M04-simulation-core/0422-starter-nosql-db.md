# 0422 Starter library: NoSQL DB

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0410](../M04-simulation-core/0410-starter-relational-db.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The NoSQL / key-value DB, complete per spec §9: items in partitions by key, ops per second per partition with throttling, hot-key skew, consistency, replication factor, item size and TTL.

## Tests to write first

Write these tests first, in `components/nosql-db/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A hot key throttles its own partition while the other partitions serve every request

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided.
- **Done (2026-10-01).** The tests are in `components/nosql-db/tests/nosql-db.test.js`. Beyond the listed one, they cover get, put, delete and query, item TTL and storage, latency and staleness by consistency, hot-key skew for requests without a key, and that every method, error and metric is exercised.
- **Model.**
  - Keys go to partitions by FNV-1a.
  - Requests without a key are synthetic load, drawn over the partitions by a Zipf distribution with exponent `hotKeySkew`.
  - Consistency changes latency by order statistics over the replicas, and eventual reads may see the value before the latest.
  - Throttled requests name their partition, so a test can tell a hot key's throttles from others.
