# Search index

A full-text or vector search cluster (Elasticsearch, OpenSearch, Solr).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:store`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `shards` | integer (shards) | `5` | Capacity |  |
| `replicas` | integer (replicas) | `1` | Capacity |  |
| `heap` | bytes | `8GB` | Capacity |  |
| `queryLatency` | distribution (ms) | `{"kind":"lognormal","median":15,"p99":120}` | Performance |  |
| `indexingThroughput` | rate | `2000/s` | Performance | Documents per second |
| `refreshInterval` | duration | `1s` | Performance |  |
| `indexSize` | bytes | `20GB` | Data |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `queryLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `queryLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `queryLatency.p99` until simulation measures it |
| `queries` | req/s | sum |  |
| `indexingLag` | s | max |  |
| `rejections` | req/s | sum |  |
| `indexSize` | bytes | sum |  |
