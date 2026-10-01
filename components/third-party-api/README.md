# Third-party API

A service run by someone else, with its own limits, errors and price (payments, maps, email).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

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

## State

| Field | Type | Holds |
| --- | --- | --- |
| `windows` | map | The second and the day calls are counted in, and how many it has accepted in each |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `call` | any | `{ status: 200 }` | `TOO_MANY_REQUESTS`, `QUOTA_EXCEEDED`, `UNAVAILABLE`, `ERROR`, `TIMEOUT` |

Private: `throttle`.

## Behaviour

- **Limits.** It accepts `rateLimit` calls each second and `dailyQuota` calls each UTC day, when one is set. It refuses the rest at once with `TOO_MANY_REQUESTS` or `QUOTA_EXCEEDED`, both with status 429, and reports `1` for `tooManyRequests`. Each call reports `1` for `calls`.
- **Cost.** Each call it accepts reports `pricePerCall` for `cost`, whatever its answer.
- **Latency and timeout.** It answers after a sample of `latency`. When the sample is over `timeout`, it gives up at the timeout with `TIMEOUT` and reports `1` for `errors`.
- **Failures.** It fails with `UNAVAILABLE`, status 503, throughout its outage windows and at the rate `slaAvailability` leaves, and otherwise with `ERROR`, status 500, at `errorRate`. Each failure reports `1` for `errors`.
- **Outage windows.** A window is written as `Sun 02:00-03:00 UTC`, or without the day for every day, and may wrap past midnight. Simulated time starts at the Unix epoch, Thursday 1 January 1970, in UTC.
