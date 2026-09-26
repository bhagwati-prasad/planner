# Scheduler (cron)

Starts jobs on a cron schedule.

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:timer`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `cron` | string | `*/5 * * * *` | Schedule | Five-field cron expression |
| `jitter` | duration | `0s` | Schedule |  |
| `catchUp` | boolean | `false` | Schedule | Run missed schedules after downtime |
| `jobDuration` | distribution (ms) | `{"kind":"lognormal","median":2000,"p99":20000}` | Jobs |  |
| `concurrencyPolicy` | enum | `forbid` | Jobs |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `runs` | runs | sum |  |
| `overlaps` | runs | sum |  |
| `missedRuns` | runs | sum |  |
| `duration` | ms | max |  |
