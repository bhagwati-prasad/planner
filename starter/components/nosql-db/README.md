# NoSQL / key-value DB

A partitioned key-value or document store (DynamoDB, Cassandra, MongoDB).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

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
