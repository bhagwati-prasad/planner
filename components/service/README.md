# Service

An API or backend service: instances with limited concurrency that call downstream dependencies.

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8) and the `servers` field of its manifest (ADR 0020). Requests arrive on `in`, whose default method is `request`, and its endpoints call downstream components over `out`.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `concurrency` | integer (requests) | `64` | Capacity | Per instance |
| `maxBacklog` | integer (requests) | `1000` | Capacity |  |
| `serviceTime` | distribution (ms) | `{"kind":"lognormal","median":20,"p99":150}` | Performance | Default for endpoints that do not set their own |
| `endpoints` | list | `[]` | Performance | Each: { "name": "GET /orders", "serviceTime": {...}, "calls": ["out", "out.insert"] }; service time in ms, calls as port or port.method |
| `cpuPerRequest` | number (ms) | `5` | Resources |  |
| `memoryPerRequest` | number (MB) | `2` | Resources |  |
| `timeout` | duration | `5s` | Reliability |  |
| `retries` | integer (retries) | `2` | Reliability |  |
| `retryBackoff` | duration | `100ms` | Reliability |  |
| `circuitBreaker` | boolean | `false` | Circuit breaker |  |
| `breakerErrorThreshold` | percent (%) | `50` | Circuit breaker |  |
| `breakerOpenDuration` | duration | `30s` | Circuit breaker |  |
| `autoscaling` | boolean | `false` | Autoscaling |  |
| `minInstances` | integer (instances) | `1` | Autoscaling |  |
| `maxInstances` | integer (instances) | `10` | Autoscaling |  |
| `targetUtilisation` | percent (%) | `70` | Autoscaling |  |
| `scaleUpDelay` | duration | `60s` | Autoscaling |  |
| `cooldown` | duration | `5m` | Autoscaling |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `serviceTime.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `serviceTime.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `serviceTime.p99` until simulation measures it |
| `backlog` | requests | sum |  |
| `liveInstances` | instances | sum |  |
| `circuitState` | state | worst | Per downstream call, as `circuitState.<call>` |
| `errors` | errors/s | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `liveInstances` | integer | Instances running now: `instances` at the start, then what autoscaling decides |
| `inFlight` | integer | Requests on a server now |
| `health` | string | `up` |
| `circuits` | map | By downstream call: its breaker's state and its last outcomes |
| `busySince` | number | When utilisation last rose over the target, in ms; -1 when it is not over |
| `lastScaledAt` | number | When autoscaling last changed `liveInstances`, in ms; -1 before it has |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `request` | any body; `path` and a `method` header | each call's reply, by call | `NO_ENDPOINT`, `CIRCUIT_OPEN`, `DEPENDENCY_FAILED`, `BACKLOG_FULL`, `TIMEOUT` |
| `health` | | `{ status, liveInstances }` | |

Private: `admit`, `retry`, `tripCircuit`, `autoscale`.

## Behaviour

- **Servers.** `liveInstances × concurrency` servers run requests (ADR 0020). The rest wait first in, first out, up to `maxBacklog` (then `BACKLOG_FULL`), for at most `timeout` (then `TIMEOUT`). The run reports `backlog` and `utilisation`.
- **Endpoints.** An endpoint's name is a path, such as `/orders`, or a verb and a path, such as `GET /orders`. A request runs the endpoint whose verb matches its `method` header and whose path is its path or a prefix of it, by whole segments; the longest path wins. A request that matches none fails with `NO_ENDPOINT`. With no endpoints, every request runs one that calls nothing.
- **Work.** A request spends its endpoint's `serviceTime`, or the service's, on its server (ADR 0021). Then it makes the endpoint's calls in order, sending the request's body: `out` calls the edge's method (ADR 0019), and `out.insert` calls `insert`. It answers with each call's reply, keyed by the call.
- **Retries.** A call that fails is sent again after `retryBackoff`, doubled for each attempt, until `retries` run out; then the request fails with `DEPENDENCY_FAILED`, whose details name the port and the callee's code. The request keeps its server while it waits.
- **Circuit breaker.** With `circuitBreaker` on, each call has a breaker of its own. Once it has seen 5 calls, it opens when the failed share of its last 10 reaches `breakerErrorThreshold`. While it is open, requests fail with `CIRCUIT_OPEN` and call nothing. After `breakerOpenDuration` it half-opens; the next outcome closes it, or opens it again. Each change reports `circuitState.<call>`.
- **Autoscaling.** With `autoscaling` on, it looks every 10 s. When the requests on its servers exceed `targetUtilisation` of them for `scaleUpDelay`, it adds an instance, up to `maxInstances`. When one instance fewer would be at or under the target, it removes one, down to `minInstances`, but never below one, since it sees only the requests on its servers. It scales at most once per `cooldown`, and requests waiting in the backlog start on a new instance at once. Each change reports `liveInstances`, as does the start of the run.
- **Metrics.** Each failed request reports `1` for `errors`, except the backlog's refusals and timeouts, which the run records on its span. `inFlight` follows the requests on its servers.
