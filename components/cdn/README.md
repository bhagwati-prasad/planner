# CDN

Edge caches close to users in front of an origin (CloudFront, Fastly, Cloudflare).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:proxy`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `edgeLocations` | integer (locations) | `200` | Network |  |
| `edgeLatency` | distribution (ms) | `{"kind":"lognormal","median":10,"p99":60}` | Network |  |
| `bandwidth` | number (Gbps) | `100` | Network |  |
| `cacheTtl` | duration | `1h` | Caching |  |
| `keyspaceSize` | integer (objects) | `100000` | Caching |  |
| `popularitySkew` | number (Zipf s) | `1.1` | Caching |  |
| `fixedHitRatio` | percent (%) | — | Caching | Overrides the keyspace model when set |
| `originShield` | boolean | `true` | Caching |  |
| `originTimeout` | duration | `30s` | Origin |  |
| `pricePerGb` | number (USD/GB) | `0.085` | Cost |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `edgeLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `edgeLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `edgeLatency.p99` until simulation measures it |
| `hitRatio` | % | min |  |
| `originRequests` | req/s | sum |  |
| `egress` | GB | sum |  |
| `edgeLatency` | ms | max |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `edge` | map | By edge location and key: each cached copy's body, size in bytes and expiry in ms |
| `shield` | map | By key: the origin shield's copy of each object, with its size in bytes and expiry in ms |
| `lookups` | integer | Gets so far |
| `hits` | integer | Gets its edge cache answered |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `get` | `{ key }`, or a path | the object's body | `BAD_GATEWAY`, `ORIGIN_TIMEOUT` |

Private: `fetchFromOrigin`, `evict`.

## Behaviour

- **Edge locations.** Each get is served at one of `edgeLocations`. The client's address, its `X-Forwarded-For` header, picks the location by a hash, so a client stays at one location. Without the header, the location is drawn at random. Each get takes a sample of `edgeLatency` and reports it as `edgeLatency`.
- **Edge cache.** A location answers from its copy of an object until the copy is `cacheTtl` old. It reports the share of gets it answered as `hitRatio`.
- **Misses.** With `originShield`, a miss goes to the shield, one more `edgeLatency` hop away. The shield answers from its own copy, and fetches from the origin only when it has none, so the origin sees one fetch per object per TTL. Without it, each location fetches its own copy. A copy from the shield expires when the shield's does.
- **Origin.** An origin fetch goes over `out` and reports `1` for `originRequests`. When the origin fails, the get fails with `BAD_GATEWAY` and the origin's code. When the origin takes longer than `originTimeout`, the get fails with `ORIGIN_TIMEOUT`.
- **Synthetic load.** A get with neither a key nor a path draws a key from `keyspaceSize` objects by `popularitySkew`, a Zipf distribution, so the hit ratio follows from the keyspace, the skew and the TTL. When `fixedHitRatio` is set, each get hits the edge with that chance instead, and a hit answers from the location's copy, or with `null` when it has none.
- **Egress.** Each response sends its object, the size of the get's message or else the length of the body's JSON, and reports it in GB as `egress`. Sending it takes its size at `bandwidth`.
- **Not modelled yet.** Concurrent misses for an object each fetch it, with no request collapsing. `pricePerGb` adds no cost.
