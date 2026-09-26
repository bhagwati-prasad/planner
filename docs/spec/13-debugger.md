# 13. Debugger

The debugger works inside any run. It adds breakpoints, inspection and watches on top of the controls in §12, and it uses one message protocol between facade and worker, so the UI and the console debug in exactly the same way.

| Feature | Behaviour | Release |
| --- | --- | --- |
| Breakpoints | On a public or private method call, message arrival or departure at a component, transit on an edge, a fault firing, or a named `ctx.log` | R0 |
| Conditional breakpoints | Expression on message, props or state, e.g. `msg.body.total > 1000 && state.messages.length > 100`; hit counts | R2 |
| Stepping | Every step unit, forward and backward, into and out of private methods and inner systems (§12) | R0 |
| Time travel | Scrub or step back to any moment; state is rebuilt from the nearest snapshot plus replay | R0 |
| Hop inspection | Headers, body, meta and timings of the message at each hop, with a diff against the previous hop | R0 |
| State inspection | Every component's typed state at the current moment; editable while paused | R0 |
| Method stack | The chain of public and private method calls active for the followed request | R0 |
| Effective properties | Every value with its source: default, override, run-only change or roll-up | R0 |
| Trace waterfall | Jaeger-style spans linked to the canvas; hovering a span highlights its hop | R1 |
| Logs | Per-component consoles with level and text filters | R1 |
| Watches | Pinned expressions re-evaluated at each pause | R1 |

## How it works

- The kernel checks breakpoints before dispatching each event and yields control when one matches.
- Snapshots of all component state are taken every 10,000 events (configurable) and at every pause, which bounds the cost of stepping back and scrubbing.
- For line-level debugging inside component code, a `debugger` statement in a method pauses in the browser's own DevTools worker debugger.
- Protocol commands include `play`, `pause`, `stop`, `restart`, `runToEnd`, `step`, `stepBack`, `seek`, `setBreakpoint`, `clearBreakpoint`, `inspect`, `evaluate`, `edit` and `branch`. The console exposes them on run handles and as `strata.debug.*` (§18).

---
Part of the [Strata Product and Technical Specification](README.md).
