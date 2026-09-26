# Worker pool

Consumers that pull messages from a queue or topic in batches.

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `consumers` | integer (workers) | `8` | Capacity |  |
| `batchSize` | integer (messages) | `10` | Processing |  |
| `pollInterval` | duration | `100ms` | Processing |  |
| `prefetch` | integer (messages) | `20` | Processing |  |
| `processingTime` | distribution (ms) | `{"kind":"lognormal","median":50,"p99":400}` | Processing | Per message |
| `maxRetries` | integer (retries) | `3` | Reliability |  |
| `backoff` | duration | `1s` | Reliability | First retry delay; doubles each attempt |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `processingTime.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `processingTime.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `processingTime.p99` until simulation measures it |
| `throughput` | msg/s | sum |  |
| `idle` | % | min |  |
| `batchLatency` | ms | max |  |
| `retries` | retries/s | sum |  |
| `poisonMessages` | messages | sum |  |
