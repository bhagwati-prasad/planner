# Serverless function

Code that runs per invocation with cold starts and concurrency limits (Lambda, Cloud Functions).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8). Invocations arrive on `in`, and its `calls` go out on `out`.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `memory` | bytes | `512MB` | Resources |  |
| `timeout` | duration | `30s` | Resources |  |
| `maxConcurrency` | integer (executions) | `1000` | Concurrency |  |
| `reservedConcurrency` | integer (executions) | `0` | Concurrency | When above 0, caps concurrency in place of maxConcurrency |
| `executionTime` | distribution (ms) | `{"kind":"lognormal","median":40,"p99":300}` | Performance |  |
| `calls` | list | `[]` | Performance | Downstream calls each invocation makes in order after its execution time, as port or port.method |
| `coldStartProbability` | percent (%) | `5` | Cold starts |  |
| `coldStartLatency` | distribution (ms) | `{"kind":"lognormal","median":300,"p99":1500}` | Cold starts |  |
| `keepWarmIdle` | duration | `10m` | Cold starts | Idle time before an instance is reclaimed |
| `pricePerGbSecond` | number (USD/GB-s) | `0.0000166667` | Cost |  |
| `pricePerInvocation` | number (USD) | `2e-7` | Cost |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `executionTime.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `executionTime.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `executionTime.p99` until simulation measures it |
| `invocations` | req/s | sum |  |
| `concurrentExecutions` | executions | sum |  |
| `coldStarts` | starts/s | sum |  |
| `throttles` | req/s | sum |  |
| `cost` | USD | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `running` | integer | Executions running now: the concurrency in use |
| `idle` | list | The warm instances not running, as when each last finished, in ms |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `invoke` | any body | each call's reply, by call | `THROTTLED`, `TIMEOUT`, `DEPENDENCY_FAILED` |

Private: `coldStart`, `reap`.

## Behaviour

- **Concurrency.** An invocation that finds `reservedConcurrency` executions running, or `maxConcurrency` when no concurrency is reserved, fails at once with `THROTTLED` and reports `1` for `throttles`. A function has no backlog, so it throttles in its own code rather than on the kernel's servers (ADR 0020).
- **Warm instances and cold starts.** An invocation runs on the warm instance that finished last, if one is idle. Otherwise it starts a new one, which cold-starts. A warm instance cold-starts too, at `coldStartProbability`, as platforms recycle instances. A cold start takes `coldStartLatency` and reports `1` for `coldStarts`. An instance stays warm for `keepWarmIdle` after it finishes, and then is reclaimed.
- **Execution.** After any cold start, the invocation runs for `executionTime`. An execution longer than `timeout` stops at the timeout with `TIMEOUT`, and its instance is not kept warm. Then it makes its `calls` in order, sending the invocation's body: `out` calls the edge's method (ADR 0019), and `out.insert` calls `insert`. A failed call fails the invocation with `DEPENDENCY_FAILED`, whose details name the port and the callee's code. The calls are bounded by their edges' timeouts, not the function's. It answers with each call's reply, keyed by the call.
- **Cost.** Each invocation that runs reports its `cost`: `pricePerInvocation`, plus `pricePerGbSecond` × `memory` in GB (10⁹ bytes) × its billed time. The billed time is its cold start, execution and calls, in whole ms.
- **Metrics.** Each invocation that runs reports `1` for `invocations`, and `concurrentExecutions` as it starts and ends.
