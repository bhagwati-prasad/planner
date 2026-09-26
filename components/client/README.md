# Client (web / mobile)

A population of users on web or mobile clients that start the traffic.

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:client`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `population` | integer (users) | `10000` | Load |  |
| `concurrency` | integer (sessions) | `100` | Load |  |
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
