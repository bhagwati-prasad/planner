# NoSQL / key-value DB

A partitioned key-value or document store (DynamoDB, Cassandra, MongoDB).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:store`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `partitions` | integer (partitions) | `10` | Capacity |  |
| `opsPerPartition` | rate | `1000/s` | Capacity |  |
| `replicationFactor` | integer (replicas) | `3` | Durability |  |
| `consistency` | enum | `eventual` | Durability |  |
| `itemSize` | bytes | `4KB` | Data |  |
| `hotKeySkew` | number (Zipf s) | `0.8` | Data | 0 is uniform; above 1 a few keys take most traffic |
| `itemTtl` | duration | — | Data | Leave empty to keep items forever |
| `latency` | distribution (ms) | `{"kind":"lognormal","median":3,"p99":20}` | Performance |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `partitionOps` | ops/s | max | Busiest partition |
| `throttledOps` | ops/s | sum |  |
| `hotPartition` | % | max |  |
| `storage` | bytes | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `items` | map | By key: its value, the value before it, when each replica applied it and when a quorum had, when it was written in ms, and its size in bytes |
| `windows` | map | By partition: the second its ops are counted in, and how many it has served in it |
| `storage` | number | Bytes stored |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `get` | `{ key }` | its value, or `null` | `THROTTLED` |
| `put` | `{ key, value }` | `null` | `THROTTLED` |
| `delete` | `{ key }` | `null` | `THROTTLED` |
| `query` | `{ prefix }` | the items whose keys start with it, as `{ key, value }` | `THROTTLED` |

Private: `route`, `throttle`, `replicate`.

## Behaviour

- **Partitions.** A key belongs to a partition by a hash of it; a query goes to its prefix's partition. A request without a key is synthetic load: it goes to a partition drawn by `hotKeySkew`, where partition k of n takes a share in proportion to 1 / k^s, and it touches no item.
- **Throttling.** Each partition serves `opsPerPartition` each second. Beyond that, a request fails with `THROTTLED`, whose details name the partition, and reports `1` for `throttledOps`. So a hot key throttles its own partition alone. Each op served reports `partitionOps`, its partition's ops so far this second, and `hotPartition`, the share of this second's ops that the busiest partition took.
- **Replicas and consistency.** A write reaches each of `replicationFactor` replicas after its own draw of `latency`. With `eventual` consistency, a write answers once the fastest replica has it, and a read asks one replica, which may not have the latest write yet. With `strong` consistency, a write answers once a quorum (a majority) has it, and a read waits for a quorum and sees the latest write a quorum has.
- **Items.** An item takes the bytes of its message, or `itemSize`, and the run reports `storage`. With `itemTtl`, an item expires that long after it was written.
- **Not modelled yet.** A stale replica returns the value before the latest, not older ones. Deletes reach every replica at once.
