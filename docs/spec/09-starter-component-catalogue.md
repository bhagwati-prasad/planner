# 9. Starter component catalogue

R0 ships 19 components and 6 connection types. Each component has configuration properties (inputs you set), typed state, public and private methods, and runtime metrics (outputs the simulation measures). Every time-based property accepts a distribution, not just a number.

## Common to every component

- **Properties:** name, description, owner/team, tags, C4 level, status (planned, existing, deprecated), technology (e.g. "PostgreSQL 16"), environment, region and zone, instances, availability target %, monthly cost, links.
- **Metrics:** requests in and out per second, latency p50/p95/p99 ms, error rate %, utilisation %, in-flight, dropped, health (up, degraded, down).

## Components

| Component | Configuration properties | Runtime metrics |
| --- | --- | --- |
| Message queue | Ingress rate msg/s (producer-driven or fixed), egress rate msg/s (consumers × per-consumer rate), capacity (messages and MB), delivery delay ms, retention period, max message size KB, ordering (none, FIFO, per-key), delivery guarantee (at-most, at-least, exactly once), visibility timeout s, max receives before DLQ, DLQ target, overflow policy (reject, drop-oldest, block producer) | Depth (current size), fill %, ingress and egress msg/s, oldest message age s, time-in-queue p50/p99, expired by retention, sent to DLQ, rejected |
| Pub/sub topic (stream) | Partitions, replication factor, retention (time and size), throughput per partition MB/s, consumer groups, ordering key, compaction, delivery semantics | Publish rate, consumer lag per group (messages and s), partition skew %, retained bytes |
| Worker / consumer pool | Consumers, batch size, poll interval ms, prefetch, processing time, max retries, backoff | Throughput, idle %, batch latency, retries, poison messages |
| Service | Instances, concurrency per instance, service time per endpoint, CPU ms and memory MB per request, max backlog, timeout, retries and backoff, circuit breaker (error threshold %, open duration s), autoscaling (min, max, target utilisation %, scale-up delay s, cooldown s), endpoints and their downstream calls | Utilisation %, backlog, in-flight, live instances, circuit state, latency per endpoint, errors |
| Serverless function | Memory MB, timeout s, max and reserved concurrency, cold-start probability % and latency ms, keep-warm idle s, execution time, price per GB-s and per invocation | Invocations/s, concurrent executions, cold starts, throttles, cost |
| Relational DB | Instance class (vCPU, RAM GB), max connections, read replicas, replication lag ms, read and write latency, IOPS limit, storage used and capacity GB, lock contention factor, isolation level, failover time s | Active and waiting connections, read and write QPS, IOPS used, storage %, replica lag, deadlocks |
| NoSQL / key-value DB | Partitions, ops/s per partition, consistency (eventual, strong), replication factor, item size KB, hot-key skew (Zipf s), latency, item TTL | Ops/s per partition, throttled ops, hot-partition %, storage |
| Cache | Capacity MB and items, eviction (LRU, LFU, TTL, random), TTL s, hit latency ms, keyspace size and access skew (Zipf), nodes, replication, write policy (through, back, around) | Hit ratio %, fill %, evictions/s, memory used, keys |
| Object storage | First-byte latency ms, throughput MB/s, request-rate limit per prefix, object size, storage class, lifecycle rules, durability and availability %, price per GB and per request | GET and PUT per second, bytes stored, egress GB, throttles |
| Search index | Shards, replicas, refresh interval s, query latency, indexing throughput docs/s, index size GB, heap GB | Queries/s, indexing lag s, rejections, index size |
| Load balancer | Layer (L4, L7), algorithm (round-robin, least-connections, weighted, IP hash, consistent hash), health check interval and thresholds, max connections, idle timeout, sticky sessions, TLS termination, processing latency ms | Active connections, req/s per target, unhealthy targets, rejected connections |
| API gateway | Routes, rate limit per key req/s and burst, auth mode, request timeout, max payload KB, transform latency ms, response cache TTL | Throttled req/s, auth failures, latency per route, cache hit % |
| CDN | Edge locations, cache TTL s, keyspace and popularity skew (or fixed hit ratio %), origin shield, edge latency ms, origin timeout, bandwidth Gbps, price per GB | Hit ratio %, origin req/s, egress GB, edge latency |
| DNS | Record TTL s, resolution latency, routing policy (simple, weighted, geo, failover), health check interval | Queries/s, failover events |
| Client (web / mobile) | User population, scenario mix, think time, concurrency, client timeout and retry policy, network profile (latency ms, bandwidth Mbps, loss %) | Requests sent, success %, end-to-end latency, timeouts |
| Auth / identity provider | Token issue latency, validation mode (local JWT or introspection) and latency, token TTL, rate limit, MFA step-up probability %, availability % | Auth req/s, failures, latency |
| Scheduler (cron) | Cron expression, job duration, concurrency policy (allow, forbid, replace), catch-up on missed runs, jitter s | Runs, overlaps, missed runs, duration |
| Third-party API | Latency, error rate %, rate limit (req/s or daily quota), timeout, SLA availability %, price per call, outage windows | Calls/s, 429 responses, errors, cost |
| External system (stub) | Latency, capacity req/s, error rate % | Standard metrics only |

The generic System component has no fixed property list. It exposes derived roll-ups, its declared contract, and the public methods bound through its boundary ports (§7).

## State and methods

Every starter component ships typed state and a default cost model for each public method, so it simulates without any code. User components add or override methods in code.

| Component | State | Public methods | Private methods |
| --- | --- | --- | --- |
| Message queue | messages, inFlight, deadLetters | publish, receive, ack, nack | expire, redeliver, sendToDlq |
| Pub/sub topic | partition logs, offsets per consumer group | publish, subscribe, poll, commit | assignPartitions, compact, trimRetention |
| Worker / consumer pool | busy workers, batch buffer | status | poll, process, retry |
| Service | instances and health, backlog, circuit state per dependency, plus any domain state you declare | Your endpoints (such as placeOrder, getOrder), health | admit, retry, tripCircuit, autoscale |
| Serverless function | warm instances, concurrency in use | invoke | coldStart, reap |
| Relational DB | tables, connections, locks, replica lag | query, insert, update, delete, begin, commit, rollback | acquireConnection, lock, replicate, failover |
| NoSQL / key-value DB | partitions and their items | get, put, delete, query | route, throttle, replicate |
| Cache | entries with expiry and access data, memory used | get, set, delete | evict, expire |
| Object storage | object metadata | put, get, delete, list | throttle, applyLifecycle |
| Search index | documents, pending index queue | index, search, delete | refresh, merge |
| Load balancer | targets and health, open connections | forward (default) | pickTarget, healthCheck |
| API gateway | routes, rate-limit buckets, response cache | forward (default) | authenticate, rateLimit, transform, cacheLookup |
| CDN | edge cache | get | fetchFromOrigin, evict |
| DNS | records, resolver cache | resolve | healthCheck, failover |
| Client (web / mobile) | sessions (tokens, cookies), pending requests | None; clients start requests from scenarios | runStep, think, retry |
| Auth / identity provider | tokens, sessions | issueToken, validateToken, revoke | mfaChallenge |
| Scheduler (cron) | jobs, last runs | trigger, pause, resume | tick, dispatch |
| Third-party API | quota used | call (default) | throttle |
| External system (stub) | none | call (default) | none |

## Connection types

Every connection carries network latency, bandwidth Mbps, packet loss %, payload size KB, timeout ms, retries with backoff and jitter, TLS overhead ms, sync or async mode, and route rules (ADR 0019). Transmission delay is payload size divided by bandwidth.

| Type | Additional properties |
| --- | --- |
| HTTP / REST | Method and path rules, keep-alive, HTTP version, idempotency |
| gRPC | Streaming mode (unary, server, client, bidirectional), deadline propagation |
| WebSocket | Connection lifetime, messages per connection, reconnect backoff |
| Async message | Producer batching, acknowledgement mode |
| DB protocol | Connection pooling (pool size, acquire timeout), prepared statements |
| File / batch | Transfer size, schedule, compression ratio |

---
Part of the [Strata Product and Technical Specification](README.md).
