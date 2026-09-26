# gRPC

Remote procedure calls over HTTP/2 with protocol buffers.

Every connection also carries the base connection properties: mode (sync or async), network latency, bandwidth, packet loss, payload size, TLS overhead, timeout, and retries with backoff and jitter. Transmission delay is payload size divided by bandwidth.

Extends `base:connection`.

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `streaming` | enum | `unary` | gRPC |  |
| `deadlinePropagation` | boolean | `true` | gRPC |  |
