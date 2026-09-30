# Worker pool

Consumers that pull messages from a queue or topic in batches.

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8). Connect `source` to the queue it reads and `out` to the component that handles each message; the edge from `out` names the method it calls.

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `consumers` | integer (workers) | `8` | Capacity |  |
| `batchSize` | integer (messages) | `10` | Processing |  |
| `pollInterval` | duration | `100ms` | Processing |  |
| `prefetch` | integer (messages) | `20` | Processing |  |
| `processingTime` | distribution (ms) | `{"kind":"lognormal","median":50,"p99":400}` | Processing | Per message |
| `maxRetries` | integer (retries) | `3` | Reliability |  |
| `backoff` | duration | `1s` | Reliability | First retry delay; doubles each attempt |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `processingTime.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `processingTime.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `processingTime.p99` until simulation measures it |
| `throughput` | msg/s | sum |  |
| `idle` | % | min |  |
| `batchLatency` | ms | max |  |
| `retries` | retries/s | sum |  |
| `poisonMessages` | messages | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `busy` | integer | Workers processing a message or waiting to retry one |
| `buffer` | queue | Received messages waiting for a free worker |
| `batches` | map | Each open batch: when it arrived and how many of its messages are left |
| `received` | integer | Batches received, which numbers them |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `status` | | `{ consumers, busy, buffered, idle }` | |

Private: `poll`, `process`, `retry`.

## Behaviour

- **Polling.** From the start of the run and every `pollInterval`, the pool asks its source for as many messages as its free workers and `prefetch` allow, less those already buffered, up to `batchSize`.
- **Processing.** Each free worker takes a buffered message for `processingTime`, then sends its body on `out` with no method, so the edge's method is called (ADR 0019). When the handler answers, the pool acknowledges the message to its source.
- **Retries.** When the handler fails, the worker waits `backoff`, doubled for each attempt, then processes the message again. After `maxRetries` retries the message is poison: the pool returns it to the queue with `nack`, and the queue's `maxReceives` and dead-letter queue decide what becomes of it.
- **Metrics.** Each handled message reports `1` for `throughput`, each retry `1` for `retries`, and each poison message `1` for `poisonMessages`. Each poll reports `idle` (the fraction of free workers), and each batch, when its last message is done, its `batchLatency` in ms.
