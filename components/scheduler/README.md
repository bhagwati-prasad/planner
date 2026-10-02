# Scheduler (cron)

Starts jobs on a cron schedule.

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

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

## State

| Field | Type | Holds |
| --- | --- | --- |
| `paused` | boolean | Whether it is paused, from `base:timer` |
| `runs` | integer | Runs so far, from `base:timer` |
| `nextAt` | number | The next time the cron expression matches, in ms, or `-1` when it never does |
| `active` | list | The runs still going |
| `missed` | integer | Schedules missed while paused, since it was last resumed |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `trigger` | any | `{ run }`, or `{ run: null }` when the concurrency policy forbids it | `PAUSED` |
| `pause` | any | `null` | |
| `resume` | any | `null` | |

Private: `tick`, `dispatch`.

## Behaviour

- **Schedule.** `cron` has five fields: minute, hour, day of month, month and day of week, each `*`, `*/n`, `a`, `a-b`, `a-b/n` or a list of them, with Sunday as `0` or `7`. When both day fields are restricted, a day matching either runs, as in cron. Simulated time starts at the Unix epoch, Thursday 1 January 1970, in UTC. A malformed expression logs a warning and never runs.
- **Runs.** Each schedule runs up to `jitter` late. A run reports `1` for `runs`, sends `{ scheduledAt, run }` on `out` when it is connected, and lasts a sample of `jobDuration`, then reports it as `duration`.
- **Concurrency.** A schedule that comes while a run is going reports `1` for `overlaps`. Then `allow` starts another run, `forbid` skips this one and reports `1` for `missedRuns`, and `replace` starts this one and drops the one going, which reports no `duration`.
- **Pause and resume.** While paused, each schedule is missed and reports `1` for `missedRuns`, and `trigger` fails with `PAUSED`. On `resume`, with `catchUp`, it runs once for all it missed.
