# WebSocket

A long-lived, two-way connection.

Every connection also carries the base connection properties: mode (sync or async), network latency, bandwidth, packet loss, payload size, TLS overhead, timeout, and retries with backoff and jitter. Transmission delay is payload size divided by bandwidth.

Extends `base:connection`.

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `async` | Connection |  |
| `connectionLifetime` | duration | `1h` | WebSocket |  |
| `messagesPerConnection` | integer (messages) | `100` | WebSocket |  |
| `reconnectBackoff` | duration | `1s` | WebSocket |  |
