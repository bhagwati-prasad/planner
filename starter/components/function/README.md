# Serverless function

Code that runs per invocation with cold starts and concurrency limits (Lambda, Cloud Functions).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `memory` | bytes | `512MB` | Resources |  |
| `timeout` | duration | `30s` | Resources |  |
| `maxConcurrency` | integer (executions) | `1000` | Concurrency |  |
| `reservedConcurrency` | integer (executions) | `0` | Concurrency |  |
| `executionTime` | distribution (ms) | `{"kind":"lognormal","median":40,"p99":300}` | Performance |  |
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
