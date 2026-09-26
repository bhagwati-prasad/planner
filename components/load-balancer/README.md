# Load balancer

Spreads connections or requests across healthy targets (ALB, NLB, HAProxy, nginx).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:proxy`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `layer` | enum | `l7` | Routing |  |
| `algorithm` | enum | `round-robin` | Routing |  |
| `stickySessions` | boolean | `false` | Routing |  |
| `tlsTermination` | boolean | `true` | Routing |  |
| `processingLatency` | distribution (ms) | `{"kind":"lognormal","median":0.5,"p99":3}` | Performance |  |
| `maxConnections` | integer (connections) | `10000` | Capacity |  |
| `idleTimeout` | duration | `60s` | Capacity |  |
| `healthCheckInterval` | duration | `10s` | Health checks |  |
| `healthyThreshold` | integer (checks) | `3` | Health checks |  |
| `unhealthyThreshold` | integer (checks) | `2` | Health checks |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `processingLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `processingLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `processingLatency.p99` until simulation measures it |
| `activeConnections` | connections | sum |  |
| `requestsPerTarget` | req/s | max |  |
| `unhealthyTargets` | targets | sum |  |
| `rejectedConnections` | connections/s | sum |  |
