# DNS

Name resolution with routing policies and health-checked failover (Route 53, Cloud DNS).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:proxy`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `recordTtl` | duration | `300s` | Records |  |
| `resolutionLatency` | distribution (ms) | `{"kind":"lognormal","median":5,"p99":50}` | Records |  |
| `routingPolicy` | enum | `simple` | Routing |  |
| `healthCheckInterval` | duration | `30s` | Routing |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `resolutionLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `resolutionLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `resolutionLatency.p99` until simulation measures it |
| `queries` | queries/s | sum |  |
| `failoverEvents` | events | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `health` | map | By edge: whether its record is healthy, and its checks failed or passed in a row |
| `answers` | map | The resolver cache: by client and name, the address it answered and when that expires, in ms |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `resolve` | `{ name }` | `{ name, address }`, the component a healthy record points at | `NXDOMAIN` |

Private: `healthCheck`, `failover`.

## Behaviour

- **Records.** Each edge leaving `out` is a record that points names at the component at its end. Without records, a lookup fails with `NXDOMAIN`.
- **Routing.** A lookup takes a sample of `resolutionLatency`, reports `1` for `queries`, and answers with one healthy record:
  - `simple`: at random;
  - `weighted`: at random, by the weights of the edges' route rules;
  - `geo`: by a hash of the client's address, its `X-Forwarded-For` header, standing in for where the client is;
  - `failover`: the first healthy record, in the order of the edges.
- **Health checks.** Every `healthCheckInterval` it calls each record's `health`, and waits for it up to the interval. A target without a `health` method passes, since it answered. A record leaves the answers after three failures in a row and returns after three passes, Route 53's default threshold. Each change reports `1` for `failoverEvents`. When every record is unhealthy, it answers as if all were healthy, as Route 53 does.
- **Resolver cache.** A client's resolver keeps each answer for `recordTtl`, and answers from it at once, with no resolution latency, even after a failover. So a failover reaches a client only when its cached answer expires. Clients without an address share one resolver.
- **Not modelled yet.** Every name resolves over the same records. Geo routing does not know where the records are.
