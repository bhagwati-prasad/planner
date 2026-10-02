# 0426 Starter library: CDN and DNS

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0411](../M04-simulation-core/0411-starter-scheduler-external.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The CDN and DNS, complete per spec §9: the CDN's edge cache with its TTL, hit ratio by popularity skew, origin fetches, origin shield and egress; DNS records with their TTL, routing policies, health checks and failover.

## Tests to write first

Write these tests first, in `components/cdn/tests`, `components/dns/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A CDN answers repeated gets from its edge cache, and fetches a miss from its origin once per TTL
- [x] DNS stops answering with a record whose health check fails, and fails over to the next

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0411 on 2026-10-01, as the human decided.
- **CDN.** Each get is served at an edge location picked by a hash of `X-Forwarded-For`, or at random without it, and each location keeps its own copies. With `originShield`, a miss costs one more `edgeLatency` hop to the shield, which fetches from the origin once per object per TTL. Without it, each location fetches its own copy. `fixedHitRatio` decides only whether the edge hits, and the shield works as usual. A get's object size is its message's size, or the length of the body's JSON. The `in` port now names `get` as its default. Its powers come from a copy of the cache's deterministic `math.js`, with its test. `fetchFromOrigin` starts the fetch and returns its promise, so it ends as a span before the fetch does. Concurrent misses are not collapsed, and `pricePerGb` adds no cost yet.
- **DNS.** The manifest gains an `out` port: each edge leaving it is a record (ADR 0022), and `resolve` answers `{ name, address }` with the node at the record's end. A record leaves and returns after three checks in a row, Route 53's default threshold, since the spec gives no threshold property. When every record is unhealthy, it answers as if all were healthy, as Route 53 does. Geo routing hashes the client's address, because the kernel does not tell the DNS where its records are. The resolver cache is keyed by client and name, and answers at once.
