# Service

An API or backend service: instances with limited concurrency that call downstream dependencies.

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `concurrency` | integer (requests) | `64` | Capacity | Per instance |
| `maxBacklog` | integer (requests) | `1000` | Capacity |  |
| `serviceTime` | distribution (ms) | `{"kind":"lognormal","median":20,"p99":150}` | Performance | Default for endpoints that do not set their own |
| `endpoints` | list | `[]` | Performance | Each: { "name": "GET /orders", "serviceTime": {...}, "calls": ["out"] } |
| `cpuPerRequest` | number (ms) | `5` | Resources |  |
| `memoryPerRequest` | number (MB) | `2` | Resources |  |
| `timeout` | duration | `5s` | Reliability |  |
| `retries` | integer (retries) | `2` | Reliability |  |
| `retryBackoff` | duration | `100ms` | Reliability |  |
| `circuitBreaker` | boolean | `false` | Circuit breaker |  |
| `breakerErrorThreshold` | percent (%) | `50` | Circuit breaker |  |
| `breakerOpenDuration` | duration | `30s` | Circuit breaker |  |
| `autoscaling` | boolean | `false` | Autoscaling |  |
| `minInstances` | integer (instances) | `1` | Autoscaling |  |
| `maxInstances` | integer (instances) | `10` | Autoscaling |  |
| `targetUtilisation` | percent (%) | `70` | Autoscaling |  |
| `scaleUpDelay` | duration | `60s` | Autoscaling |  |
| `cooldown` | duration | `5m` | Autoscaling |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `serviceTime.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `serviceTime.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `serviceTime.p99` until simulation measures it |
| `backlog` | requests | sum |  |
| `liveInstances` | instances | sum |  |
| `circuitState` | state | worst |  |
| `errors` | errors/s | sum |  |
