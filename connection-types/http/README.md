# HTTP / REST

Request and response over HTTP.

Every connection also carries the base connection properties: mode (sync or async), network latency, bandwidth, packet loss, payload size, TLS overhead, timeout, and retries with backoff and jitter. Transmission delay is payload size divided by bandwidth.

Extends `base:connection`.

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `methodRules` | list | `[]` | HTTP | e.g. "GET /orders/*" |
| `httpVersion` | enum | `2` | HTTP |  |
| `keepAlive` | boolean | `true` | HTTP |  |
| `idempotent` | boolean | `true` | HTTP | Safe to retry |
