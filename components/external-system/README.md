# External system (stub)

A stand-in for anything outside the model: fixed latency, capacity and error rate.

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:external`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `latency` | distribution (ms) | `{"kind":"lognormal","median":50,"p99":300}` | Behaviour |  |
| `capacity` | rate | `1000/s` | Behaviour |  |
| `errorRate` | percent (%) | `0` | Behaviour |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `window` | map | The second calls are counted in, and how many it has accepted in it |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `call` | any | `null` | `OVERLOADED`, `UNAVAILABLE` |

## Behaviour

- **Capacity.** It accepts `capacity` calls each second and refuses the rest at once with `OVERLOADED`.
- **Latency and failures.** It answers after a sample of `latency`, and fails with `UNAVAILABLE` at `errorRate`.
