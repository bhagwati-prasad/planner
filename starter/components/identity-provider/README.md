# Auth / identity provider

Issues and validates tokens (Auth0, Cognito, Keycloak, Entra ID).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `tokenIssueLatency` | distribution (ms) | `{"kind":"lognormal","median":30,"p99":200}` | Tokens |  |
| `tokenTtl` | duration | `1h` | Tokens |  |
| `validationMode` | enum | `local-jwt` | Validation |  |
| `validationLatency` | distribution (ms) | `{"kind":"lognormal","median":1,"p99":5}` | Validation |  |
| `rateLimit` | rate | `500/s` | Limits |  |
| `mfaStepUpProbability` | percent (%) | `2` | Limits |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `validationLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `validationLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `validationLatency.p99` until simulation measures it |
| `authRequests` | req/s | sum |  |
| `failures` | req/s | sum |  |
