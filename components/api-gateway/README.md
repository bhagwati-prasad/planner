# API gateway

The front door for APIs: routing, authentication, rate limits and caching.

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8). Requests arrive on `in`, whose default method is `forward`, and go upstream on `out`, where the edges' route rules choose the target (ADR 0019).

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

## State

| Field | Type | Holds |
| --- | --- | --- |
| `buckets` | map | By key: the tokens its rate-limit bucket holds, and when they were counted, in ms |
| `cache` | map | By path: a cached response body, and when it was cached, in ms |
| `cacheLookups` | integer | Reads it looked up in its cache |
| `cacheHits` | integer | Lookups its cache answered |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `forward` | any body; `path`, a `method` header and auth headers | the upstream's response | `NO_ROUTE`, `PAYLOAD_TOO_LARGE`, `AUTH_FAILED`, `THROTTLED`, `GATEWAY_TIMEOUT`, `BAD_GATEWAY` |

Private: `authenticate`, `rateLimit`, `transform`, `cacheLookup`.

## Behaviour

- **Routes.** With `routes`, a request must match one, or it fails with `NO_ROUTE`. A route is a path, such as `/health`, or a verb and a path, such as `GET /orders/*`. The verb comes from the request's `method` header. A `*` matches one segment, or, last, the rest of the path.
- **Payload.** A request larger than `maxPayload` fails with `PAYLOAD_TOO_LARGE`.
- **Authentication.** `api-key` needs an `x-api-key` header, `jwt` and `oauth2` an `authorization: Bearer …` header, and `mtls` an `x-client-cert` header. Header names match in any case. A request without one fails with `AUTH_FAILED` and reports `1` for `authFailures`. With `none`, every request passes.
- **Rate limit.** Each key, the credential that authenticated the request (`anonymous` without one), has a token bucket. It holds `burst` tokens (at least one) and refills at `rateLimit`. A request with no token left fails with `THROTTLED` and reports `1` for `throttled`.
- **Transform.** A request that passes takes `transformLatency`.
- **Response cache.** With a `responseCacheTtl` above 0, reads (`GET`, or no verb) are answered from the cache for that long after the upstream answered them, by path. Each lookup reports `cacheHitRatio`, the share of lookups so far that hit. Writes are never cached.
- **Upstream.** Otherwise the request goes on `out` with its path and headers and no method, so the edge's method is called. An upstream that has not answered within `requestTimeout` gets `GATEWAY_TIMEOUT`, at the timeout. One that fails gets `BAD_GATEWAY`, whose details name its code.
