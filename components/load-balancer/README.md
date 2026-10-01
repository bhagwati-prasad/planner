# Load balancer

Spreads connections or requests across healthy targets (ALB, NLB, HAProxy, nginx).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8). Requests arrive on `in`, whose default method is `forward`. Its targets are the components at the ends of the edges leaving `out`, which it lists and chooses between itself (ADR 0022).

Extends `base:proxy`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `layer` | enum | `l7` | Routing |  |
| `algorithm` | enum | `round-robin` | Routing |  |
| `stickySessions` | boolean | `false` | Routing |  |
| `tlsTermination` | boolean | `true` | Routing |  |
| `processingLatency` | distribution (ms) | `{"kind":"lognormal","median":0.5,"p99":3}` | Performance |  |
| `maxConnections` | integer (connections) | `10000` | Capacity |  |
| `idleTimeout` | duration | `60s` | Capacity |  |
| `healthCheckInterval` | duration | `10s` | Health checks |  |
| `healthyThreshold` | integer (checks) | `3` | Health checks |  |
| `unhealthyThreshold` | integer (checks) | `2` | Health checks |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `processingLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `processingLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `processingLatency.p99` until simulation measures it |
| `activeConnections` | connections | sum |  |
| `requestsPerTarget` | req/s | max |  |
| `unhealthyTargets` | targets | sum |  |
| `rejectedConnections` | connections/s | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `health` | map | By edge: whether its target is healthy, and its checks failed or passed in a row |
| `active` | map | By edge: the requests open to its target |
| `open` | integer | Requests open through the balancer |
| `cursor` | integer | Where round-robin turns next |
| `current` | map | By edge: its current weight, for smooth weighted round-robin |
| `affinity` | map | By client: the edge it sticks to, and when it last sent, in ms |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `forward` | any body; `path`, headers and an `x-forwarded-for` header | the target's response | `CONNECTION_REJECTED`, `NO_HEALTHY_TARGET`, `BAD_GATEWAY` |

Private: `pickTarget`, `healthCheck`.

## Behaviour

- **Algorithms.** A request goes to one of its healthy targets:
  - `round-robin`: each in turn;
  - `least-connections`: the one with the fewest open requests, taking ties in turn;
  - `weighted`: by each edge's route `weight` (1 by default), spread evenly by smooth weighted round-robin, as nginx does;
  - `ip-hash`: by a hash of the client's address, from the `x-forwarded-for` header;
  - `consistent-hash`: by the same hash on a ring of 64 points per target, so a target that leaves moves only its own clients.
- **Sending.** It sends the request on over the chosen edge, with its path and headers and no method, so the edge's method is called (ADR 0019). A target that fails gets `BAD_GATEWAY`, whose details name its code and the target. Each request reports `1` for `requestsPerTarget.<target>`, and `activeConnections` as it opens and closes.
- **Stickiness.** With `stickySessions`, or at `layer` `l4`, where it balances connections rather than requests, a client stays on its target while it is healthy, until the client has been idle for `idleTimeout`.
- **Health checks.** Every `healthCheckInterval` it calls each target's `health`, waiting at most the interval. A target that fails `unhealthyThreshold` checks in a row leaves, and one that then passes `healthyThreshold` returns. A target without a `health` method passes, since it answered. Each change reports `unhealthyTargets`. With no healthy target, a request fails with `NO_HEALTHY_TARGET`.
- **Connections.** A request that finds `maxConnections` open fails with `CONNECTION_REJECTED` and reports `1` for `rejectedConnections`.
- **Processing.** Each request takes `processingLatency`. `tlsTermination` is recorded but adds no cost yet, since connections do not model TLS (task 0405).
