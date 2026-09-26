# DNS

Name resolution with routing policies and health-checked failover (Route 53, Cloud DNS).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:proxy`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `recordTtl` | duration | `300s` | Records |  |
| `resolutionLatency` | distribution (ms) | `{"kind":"lognormal","median":5,"p99":50}` | Records |  |
| `routingPolicy` | enum | `simple` | Routing |  |
| `healthCheckInterval` | duration | `30s` | Routing |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `resolutionLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `resolutionLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `resolutionLatency.p99` until simulation measures it |
| `queries` | queries/s | sum |  |
| `failoverEvents` | events | sum |  |
