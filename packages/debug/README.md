# strata-debug

Breakpoints, stepping in every unit, time travel, state and method inspection, and the trace recorder.

- Runs in: Worker (ADR 0024); the facade reaches it through the worker protocol (task 0417)
- Specification: spec §13
- Built in: M04 and M10 (see `plan/ROADMAP.md`)
- Entry point: `src/index.js`, the only file other packages may import (eng §4)

So far, breakpoints and inspection (task 0416):

- `createDebugger(control)` (`src/debugger.js`): a debugger over a run's controls, strata-sim's `createControl`.
  - **Breakpoints.** `setBreakpoint(spec)` pauses a run to end, or a step, before the event in which something happens: `{ on: 'call', node, method, kind }`, a public or private method starting; `{ on: 'arrive', node, method }`, a message arriving at a component; `{ on: 'depart', node, port }`, a message leaving one; `{ on: 'edge', edge }`, a message sent over an edge; or `{ on: 'log', name, node }`, a log whose first argument is `name`. The fields after the first are optional. The next move goes past it. `{ on: 'fault' }` fails with `INVALID` until chaos faults (R1). `clearBreakpoints()` removes them all, the control's own included.
  - **Hops.** `hops(trace)` lists the messages of a request, the followed one by default, as they arrived at each component: the event and time, node, port, method, kind, path, headers, body, size, attempt and edge, how long after the hop before (`sinceUs`), and how it differs from it (`diff`, as `{ field, a, b }`, with dotted paths under `headers.` and `body.`). The run must keep messages, with `inspect: true`.
  - **Method stack.** `methodStack()` lists the followed request's public and private calls still running, outermost first.
  - **State.** `state(node)` is a copy of a component's state now.
  - **Effective properties.** `effectiveProps(node)` gives each property's value with its source: `default` (the manifest's), `override` (the model's) or `run-only` (an edit to the paused run, task 0415). Whether an override comes from the component itself or an ancestor's roll-up is the model's to say (spec §6), as the facade does.

A breakpoint on a happening inside an event pauses before that event: the run handles the event, sees the happening, and seeks back one event (ADR 0023), so the moment it pauses at is the one a run from zero reaches.
