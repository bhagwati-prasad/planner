# Message queue

Buffers messages between producers and consumers (SQS, RabbitMQ, Azure Service Bus queues).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:queue`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `ingressMode` | enum | `producer-driven` | Throughput | Messages arrive as producers send them, or at a fixed rate |
| `ingressRate` | rate | `500/s` | Throughput | Used when the ingress mode is fixed |
| `consumers` | integer (consumers) | `4` | Throughput |  |
| `perConsumerRate` | rate | `100/s` | Throughput | Egress rate = consumers × per-consumer rate |
| `capacityMessages` | integer (messages) | `100000` | Capacity |  |
| `capacityBytes` | bytes | `1GB` | Capacity |  |
| `maxMessageSize` | bytes | `256KB` | Capacity |  |
| `overflowPolicy` | enum | `reject` | Capacity |  |
| `deliveryDelay` | distribution (ms) | `{"kind":"lognormal","median":5,"p99":40}` | Delivery |  |
| `ordering` | enum | `none` | Delivery |  |
| `deliveryGuarantee` | enum | `at-least-once` | Delivery |  |
| `visibilityTimeout` | duration | `30s` | Delivery |  |
| `maxReceives` | integer (receives) | `5` | Delivery | Receives before a message goes to the dead-letter queue |
| `dlqTarget` | ref | — | Delivery | The node that receives dead letters (or connect the dlq port) |
| `retention` | duration | `4d` | Durability |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `deliveryDelay.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `deliveryDelay.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `deliveryDelay.p99` until simulation measures it |
| `depth` | messages | sum | Current size |
| `fill` | % | max |  |
| `ingress` | msg/s | sum |  |
| `egress` | msg/s | sum |  |
| `oldestAge` | s | max |  |
| `timeInQueue.p50` | ms | max |  |
| `timeInQueue.p99` | ms | max |  |
| `expired` | messages | sum | Dropped by retention |
| `sentToDlq` | messages | sum |  |
| `rejected` | messages | sum |  |
| `dropped` | messages | sum | Dropped by the drop-oldest overflow policy |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `messages` | queue | Visible messages, oldest first |
| `inFlight` | map | Received messages awaiting `ack`, by id |
| `deadLetters` | list | Messages received `maxReceives` times |
| `blocked` | queue | Publishes waiting for space under `block-producer` |
| `published`, `bytes`, `dedup`, `expiryArmed`, `tokens`, `tokensAt` | | Message ids, visible bytes, ids by `dedupId`, the retention timer and the egress allowance |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `publish` | the message body; `sizeBytes` from the message | `{ id }`, or `{ id, blocked: true }`, or `{ id, duplicate: true }` | `QUEUE_FULL`, `MESSAGE_TOO_LARGE` |
| `receive` | `{ max }` | `[{ id, body, receives }]` | |
| `ack` | `{ id }` | `{ ok: true }` | `UNKNOWN_MESSAGE` |
| `nack` | `{ id }` | `{ ok: true }` | `UNKNOWN_MESSAGE` |

Private: `expire`, `redeliver`, `sendToDlq`. `publish` takes `deliveryDelay`.

## Behaviour

- **Capacity and overflow.** `capacityMessages` and `capacityBytes` bound the visible messages. When full, `reject` refuses with `QUEUE_FULL`, `drop-oldest` drops from the front, and `block-producer` holds the publish until a receive makes room. A message over `maxMessageSize` is refused with `MESSAGE_TOO_LARGE`.
- **Retention.** A visible message expires `retention` after it arrived, at that simulated time: one timer is always set for the oldest message, and `receive` never returns an expired one.
- **Delivery.** `receive` returns up to `max` messages, and no more than the egress rate allows: `consumers × perConsumerRate` per second, with at most a second's worth at once. With `ordering: per-key`, a key's next message waits while one is in flight (the key is the body's `key`). `at-most-once` keeps nothing in flight. `exactly-once` drops a publish whose `dedupId` it has seen.
- **In flight.** A received message returns to the front after `visibilityTimeout` unless acknowledged, as `nack` returns it at once. A message received `maxReceives` times goes to `deadLetters` instead, and is published on the `dlq` port when `dlqTarget` names the dead-letter queue.
- **Ingress.** With `ingressMode: fixed`, the queue generates a message every `1 / ingressRate` seconds from the start of the run.
- **Metrics.** Each publish, receive, expiry, rejection, drop and dead letter reports `1` for `ingress`, `egress`, `expired`, `rejected`, `dropped` and `sentToDlq`, which the metrics pipeline sums per second. Each received message reports its `timeInQueue` in ms. After each change it reports `depth`, `fill` (a fraction) and `oldestAge` in s.
