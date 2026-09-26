# CDN

Edge caches close to users in front of an origin (CloudFront, Fastly, Cloudflare).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

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
