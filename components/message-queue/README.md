# Message queue

Buffers messages between producers and consumers (SQS, RabbitMQ, Azure Service Bus queues).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

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
