# External system (stub)

A stand-in for anything outside the model: fixed latency, capacity and error rate.

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:external`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `latency` | distribution (ms) | `{"kind":"lognormal","median":50,"p99":300}` | Behaviour |  |
| `capacity` | rate | `1000/s` | Behaviour |  |
| `errorRate` | percent (%) | `0` | Behaviour |  |
