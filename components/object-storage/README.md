# Object storage

Durable blob storage addressed by key (S3, GCS, Azure Blob).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:store`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `firstByteLatency` | distribution (ms) | `{"kind":"lognormal","median":20,"p99":120}` | Performance |  |
| `throughput` | number (MB/s) | `100` | Performance |  |
| `requestRateLimit` | rate | `3500/s` | Performance | Per key prefix |
| `objectSize` | bytes | `1MB` | Data |  |
| `storageClass` | enum | `standard` | Data |  |
| `lifecycleRules` | list | `[]` | Data | e.g. "archive after 30d" |
| `durability` | percent (%) | `99.999999999` | Durability |  |
| `availability` | percent (%) | `99.99` | Durability |  |
| `pricePerGb` | number (USD/GB-month) | `0.023` | Cost |  |
| `pricePerThousandRequests` | number (USD) | `0.0004` | Cost |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `firstByteLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `firstByteLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `firstByteLatency.p99` until simulation measures it |
| `gets` | req/s | sum |  |
| `puts` | req/s | sum |  |
| `bytesStored` | bytes | sum |  |
| `egress` | GB | sum |  |
| `throttles` | req/s | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `objects` | map | By key: its body, size in bytes, storage class, and when it was put in ms |
| `windows` | map | By prefix: the second its requests are counted in, and how many it has served in it |
| `stored` | number | Bytes stored |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `put` | `{ key, body?, storageClass? }` | `{ key, size }` | `THROTTLED`, `UNAVAILABLE` |
| `get` | `{ key }` | its body | `NO_SUCH_KEY`, `ARCHIVED`, `THROTTLED`, `UNAVAILABLE` |
| `delete` | `{ key }` | `null` | `THROTTLED`, `UNAVAILABLE` |
| `list` | `{ prefix }` | the objects under it, by key, as `{ key, size, storageClass }` | `THROTTLED`, `UNAVAILABLE` |

Private: `throttle`, `applyLifecycle`.

## Behaviour

- **Objects.** A put stores its body under its key, with the bytes of its message or `objectSize`, in its own `storageClass` or the storage's. Each change reports `bytesStored`. Each put reports `1` for `puts`, and each get `1` for `gets` and the GB it serves as `egress`.
- **Rate limit.** Each prefix, a key up to its last `/`, serves `requestRateLimit` requests a second. Beyond that a request fails with `THROTTLED`, whose details name the prefix, and reports `1` for `throttles`. Other prefixes keep their own limits.
- **Latency.** A request takes `firstByteLatency`; a put or get also takes its object's transfer at `throughput` MB/s.
- **Availability.** A request fails with `UNAVAILABLE` at the rate `availability` leaves.
- **Storage classes and lifecycle.** Each lifecycle rule, such as `infrequent-access after 30d`, `archive after 60d` or `expire after 90d`, acts on each object that long after it was put. An archived object cannot be read (`ARCHIVED`); an expired one is gone. A rule in another form is logged as a warning when the run starts and ignored.
- **Not modelled yet.** `durability` loses no objects. `pricePerGb` and `pricePerThousandRequests` report no cost; cost analysis is planned for M20. Infrequent-access objects read as fast as standard ones.
