# Cache

An in-memory cache in front of an origin (Redis, Memcached).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

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
