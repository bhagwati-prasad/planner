# Object storage

Durable blob storage addressed by key (S3, GCS, Azure Blob).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:store`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `firstByteLatency` | distribution (ms) | `{"kind":"lognormal","median":20,"p99":120}` | Performance |  |
| `throughput` | number (MB/s) | `100` | Performance |  |
| `requestRateLimit` | rate | `3500/s` | Performance | Per key prefix |
| `objectSize` | bytes | `1MB` | Data |  |
| `storageClass` | enum | `standard` | Data |  |
| `lifecycleRules` | list | `[]` | Data | e.g. "archive after 30d" |
| `durability` | percent (%) | `99.999999999` | Durability |  |
| `availability` | percent (%) | `99.99` | Durability |  |
| `pricePerGb` | number (USD/GB-month) | `0.023` | Cost |  |
| `pricePerThousandRequests` | number (USD) | `0.0004` | Cost |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `firstByteLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `firstByteLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `firstByteLatency.p99` until simulation measures it |
| `gets` | req/s | sum |  |
| `puts` | req/s | sum |  |
| `bytesStored` | bytes | sum |  |
| `egress` | GB | sum |  |
| `throttles` | req/s | sum |  |
