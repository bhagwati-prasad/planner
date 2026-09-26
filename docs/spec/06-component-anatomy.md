# 6. Component anatomy

Every component has the same anatomy, whether it is a library component, a user's own component or a whole system: properties, state, public methods, private methods, metrics and ports. The anatomy is identical at every level of recursion.

| Facet | What it is | Example: message queue |
| --- | --- | --- |
| Properties | Configuration that people set | Capacity 100,000 messages; retention 4 d |
| State | Typed runtime data, with initial values | Messages, in-flight messages, dead letters |
| Public methods | Operations other components call over edges | `publish`, `receive`, `ack`, `nack` |
| Private methods | Operations only the component itself can call | `expire`, `redeliver` |
| Metrics | Measurements recorded during runs | Depth, oldest message age |
| Ports | Where edges attach; each port exposes some public methods | `in` exposes `publish`; `consumers` exposes `receive`, `ack` and `nack` |

## Public methods

- A public method has a name, input and output schemas, the ports that expose it, the errors it can return, and a cost model: a latency distribution plus CPU and capacity use.
- A message arriving on a port names the method it calls in `msg.method`. If it names none, the port's default method runs.
- An edge can be bound to one method (`method: 'publish'`), and the edge label then shows the method name.
- Calling a method that the port does not expose fails with `E_METHOD_NOT_EXPOSED`, visible in the trace.

## Private methods

- A private method is called only through `ctx.call(name, args)` from the component's own code.
- Each call appears as a child span in the trace, with its own optional latency, so the debugger can step into it.
- Private methods can never be reached over an edge. The kernel enforces this.

## State

- State is declared as a typed schema with initial values. State types are the property types plus `queue`, `list`, `map` and `table` (keyed rows).
- Initial state can be overridden per component instance or loaded from JSON or CSV fixtures.
- During a run, state changes only through the component's own methods. While a run is paused, people can edit it directly (§12).
- State is shown in the inspector and the debugger, snapshotted for stepping back, and always JSON-serialisable.

## Black box or expanded

Every component runs in one of two modes, chosen per run:

- **Black box:** the component's own behaviour code or declarative model answers each public method.
- **Expanded:** its inner system answers. Each public method is bound, through a boundary port, to a public method of a component inside.

A component without an inner system always runs as a black box. In this document, a component that has an inner system is called a **composite**.

---
Part of the [Strata Product and Technical Specification](README.md).
