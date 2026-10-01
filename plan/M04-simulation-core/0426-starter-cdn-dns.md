# 0426 Starter library: CDN and DNS

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0411](../M04-simulation-core/0411-starter-scheduler-external.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The CDN and DNS, complete per spec §9: the CDN's edge cache with its TTL, hit ratio by popularity skew, origin fetches, origin shield and egress; DNS records with their TTL, routing policies, health checks and failover.

## Tests to write first

Write these tests first, in `components/cdn/tests`, `components/dns/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A CDN answers repeated gets from its edge cache, and fetches a miss from its origin once per TTL
- [ ] DNS stops answering with a record whose health check fails, and fails over to the next

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0411 on 2026-10-01, as the human decided.
