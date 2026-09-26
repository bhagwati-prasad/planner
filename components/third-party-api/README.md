# Third-party API

A service run by someone else, with its own limits, errors and price (payments, maps, email).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:external`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `latency` | distribution (ms) | `{"kind":"lognormal","median":120,"p99":900}` | Performance |  |
| `errorRate` | percent (%) | `0.5` | Reliability |  |
| `timeout` | duration | `10s` | Reliability |  |
| `slaAvailability` | percent (%) | `99.9` | Reliability |  |
| `outageWindows` | list | `[]` | Reliability | e.g. "Sun 02:00-03:00 UTC" |
| `rateLimit` | rate | `100/s` | Limits |  |
| `dailyQuota` | integer (calls) | — | Limits | Leave empty for no quota |
| `pricePerCall` | number (USD) | `0.001` | Cost |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `calls` | req/s | sum |  |
| `tooManyRequests` | req/s | sum | 429 responses |
| `errors` | req/s | sum |  |
| `cost` | USD | sum |  |
