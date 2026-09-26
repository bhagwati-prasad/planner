# API gateway

The front door for APIs: routing, authentication, rate limits and caching.

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:proxy`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `routes` | list | `[]` | Routing | e.g. "GET /orders/*" |
| `authMode` | enum | `jwt` | Security |  |
| `rateLimit` | rate | `100/s` | Limits | Per API key |
| `burst` | integer (requests) | `200` | Limits |  |
| `maxPayload` | bytes | `10MB` | Limits |  |
| `requestTimeout` | duration | `29s` | Limits |  |
| `transformLatency` | distribution (ms) | `{"kind":"lognormal","median":1,"p99":5}` | Performance |  |
| `responseCacheTtl` | duration | `0s` | Performance | 0 turns the response cache off |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `transformLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `transformLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `transformLatency.p99` until simulation measures it |
| `throttled` | req/s | sum |  |
| `authFailures` | req/s | sum |  |
| `cacheHitRatio` | % | min |  |
