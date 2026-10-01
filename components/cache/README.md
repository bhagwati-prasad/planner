# Cache

An in-memory cache in front of an origin (Redis, Memcached).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8). Requests arrive on `in`; writes reach its origin, such as a database, over `origin` when that is connected.

Extends `base:cache`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `capacityMemory` | bytes | `4GB` | Capacity |  |
| `capacityItems` | integer (items) | `1000000` | Capacity |  |
| `nodes` | integer (nodes) | `3` | Capacity |  |
| `replication` | integer (replicas) | `1` | Capacity |  |
| `eviction` | enum | `lru` | Behaviour |  |
| `ttl` | duration | `5m` | Behaviour |  |
| `writePolicy` | enum | `write-through` | Behaviour |  |
| `hitLatency` | distribution (ms) | `{"kind":"lognormal","median":0.5,"p99":3}` | Performance |  |
| `keyspaceSize` | integer (keys) | `10000000` | Workload |  |
| `accessSkew` | number (Zipf s) | `1` | Workload |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `hitLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `hitLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `hitLatency.p99` until simulation measures it |
| `hitRatio` | % | min |  |
| `fill` | % | max |  |
| `evictions` | evictions/s | sum |  |
| `memoryUsed` | bytes | sum |  |
| `keys` | keys | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `entries` | map | By key: its value, size, expiry in ms (null for none), last use, uses, and whether the origin lacks it |
| `memory` | number | Bytes used, counting each replica |
| `tick` | integer | Counts uses, to order them |
| `lookups`, `hits` | integer | Gets so far, and those that hit |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `get` | `{ key }`, or `{}` for synthetic load | its value, or `null` on a miss | |
| `set` | `{ key, value, ttl? }`, `ttl` in ms over the cache's own | `null` | `ORIGIN_FAILED` |
| `delete` | `{ key }` | `null` | |

Private: `evict`, `expire`.

## Behaviour

- **Entries.** A set caches a value for `ttl`, or its own `ttl`; an entry then expires. Each entry takes the bytes of its message, once on its node and once on each of `replication` replicas. Each change reports `memoryUsed`, `keys` and `fill`, the larger of the shares of `capacityItems` and `capacityMemory` used.
- **Eviction.** A set that would pass either capacity first evicts, so the cache never passes it and a new entry is never its own victim. It evicts the entry used longest ago (`lru`), the one used least and then longest ago (`lfu`), the one expiring soonest (`ttl`), or one at random (`random`). Each eviction reports `1` for `evictions`.
- **Hit ratio.** Each get reports `hitRatio`, the share of gets so far that hit. A get without a key is synthetic load: its key is drawn from `keyspaceSize` keys by Zipf's law with exponent `accessSkew`, and a miss fills it, as its caller would. So the hit ratio follows from the keyspace, the skew and the capacity. The draw computes its powers in `math.js` from IEEE 754 arithmetic alone, so every engine draws the same keys (eng §13).
- **Write policies.** With `origin` connected, `write-through` writes there first, then caches; `write-around` writes there and drops the cached entry; `write-back` only caches, and writes an entry there when it is evicted or expires. A write the origin fails fails with `ORIGIN_FAILED`. Without `origin`, sets only cache.
- **Not modelled yet.** `nodes` do not split the capacity, so one node's loss cannot be simulated until chaos arrives (M09). Gets take `hitLatency` whether they hit or miss.
