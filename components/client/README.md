# Client (web / mobile)

A population of users on web or mobile clients that start the traffic.

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:client`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `population` | integer (users) | `10000` | Load |  |
| `concurrency` | integer (sessions) | `100` | Load |  |
| `scenarios` | map | `{}` | Load | Steps by scenario name, each { call, path, headers, body, extract, think } |
| `scenarioMix` | map | `{}` | Load | Share of each scenario, e.g. { "browse": 70, "checkout": 30 } |
| `thinkTime` | distribution (ms) | `{"kind":"exponential","mean":5000}` | Load |  |
| `clientTimeout` | duration | `10s` | Retries |  |
| `retries` | integer (retries) | `1` | Retries |  |
| `retryBackoff` | duration | `500ms` | Retries |  |
| `networkLatency` | distribution (ms) | `{"kind":"lognormal","median":40,"p99":200}` | Network |  |
| `networkBandwidth` | number (Mbps) | `20` | Network |  |
| `packetLoss` | percent (%) | `0.1` | Network |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `requestsSent` | req/s | sum |  |
| `success` | % | min |  |
| `endToEnd.p99` | ms | max |  |
| `timeouts` | req/s | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `sessions` | map | By session: its scenario, its step, and its variables, such as tokens it extracted and its user |
| `pending` | integer | Requests in flight |
| `finished` | integer | Steps finished, after their retries |
| `succeeded` | integer | Steps that succeeded |
| `latencies` | map | How many finished steps took each span of end-to-end latency, in log-sized buckets |

## Methods

None public: clients start requests from their scenarios. Private: `runStep`, `think`, `retry`.

## Scenarios

`scenarios` maps a name to its steps, run in order. A step has:

| Field | Holds |
| --- | --- |
| `call` | The port, such as `out`, which calls the edge's own method, or a port and method, such as `out.login` |
| `path`, `headers`, `body` | What it sends, with the session's variables in it |
| `extract` | Variables to take from the response, by name, each a `$.path` such as `$.token` or `$.items[0].id` |
| `think` | The think time after it, in ms or as a distribution, instead of `thinkTime` |

A variable is written `${name}`. A value that is exactly `${name}` takes the variable as it is, a number or an object; elsewhere it takes it as text. `${user}` is the session's user. For example:

```json
{
  "orders": [
    { "call": "out.login", "path": "/login", "body": { "user": "${user}" }, "extract": { "token": "$.token" } },
    { "call": "out.listOrders", "path": "/orders", "headers": { "Authorization": "Bearer ${token}" } }
  ]
}
```

## Behaviour

- **Sessions.** At the start, `concurrency` sessions begin at once. Each runs scenarios one after another, each picked by `scenarioMix`, or at random among them without one, for a user drawn from `population`.
- **Steps.** A session thinks after each step, for the step's `think` or a sample of `thinkTime`. A step that fails, after its retries, abandons the scenario, and the session thinks and begins another.
- **Network.** Each attempt crosses the client's own network first: a sample of `networkLatency`, plus its body's size at `networkBandwidth` when that is above 0. It is lost at `packetLoss`, and then it times out.
- **Timeouts and retries.** An attempt that has no answer within `clientTimeout` of its start gives up, and reports `1` for `timeouts`. A failed or timed-out step is tried again up to `retries` times. Before each retry it waits `retryBackoff`, doubled for each retry before.
- **Metrics.** Each attempt reports `1` for `requestsSent`. Each finished step reports the share of steps that succeeded as `success`, and the 99th percentile of end-to-end latency, from a step's first attempt to its last answer, as `endToEnd.p99`. The percentile comes from a histogram of buckets about 6% wide.
- **Without scenarios.** Each session sends one request on `out`, over the edge's own method, after each think time.
- **Not modelled yet.** Inline checks, cookies and load profiles arrive with tasks 0801 and 0802.
