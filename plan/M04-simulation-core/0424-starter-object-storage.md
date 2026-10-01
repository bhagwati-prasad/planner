# 0424 Starter library: object storage

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0423](../M04-simulation-core/0423-starter-cache.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

Object storage, complete per spec §9: objects' metadata, first-byte latency and throughput by object size, request-rate limits per prefix, storage classes, lifecycle rules, durability and availability, and price per GB and per request.

## Tests to write first

Write these tests first, in `components/object-storage/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Requests over the rate limit of one prefix are throttled while other prefixes serve every request

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided.
