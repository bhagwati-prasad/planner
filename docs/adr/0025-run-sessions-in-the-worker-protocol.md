# 0025 Run sessions in the worker protocol

Status: Accepted
Date: 2026-10-02

## Context and problem

Task 0417 puts simulation on the facade: `strata.sim.start` returns a run handle with every control of spec §12, and `strata.debug.*` exposes the debugger of spec §13 (spec §18 "Console API"). Runs live in the simulation worker (ADR 0018), and so does the debugger (ADR 0024). Today the worker protocol has three requests: `run`, the walking skeleton's single request; `load`, which evaluates behaviour scripts; and `call`, which runs one public method. Nothing in it holds a run between messages, so nothing can pause, step or edit one. Spec §13 says the facade and the worker share one debugger protocol. It names that protocol's commands (`play`, `pause`, `stop`, `restart`, `runToEnd`, `step`, `stepBack`, `seek`, `setBreakpoint`, `clearBreakpoint`, `inspect`, `evaluate`, `edit` and `branch`) but not its messages. Eng §13 fixes the envelope `{ v, type, id, payload }` and the streaming rule: chunks of at most 64 KB, at most every 100 ms of wall time. Changing the worker protocol is the human's decision (CLAUDE.md, "Ask the human first").

The console example of spec §18 also reads some results synchronously: `run.state(db).orders.length`, `run.edit(db, { … })` and `strata.sim.compare(run, branch)` are not awaited. A handle on the main thread can answer those only from data it already holds.

## Decision drivers

- Spec §13: the UI and the console debug through one protocol, so neither has a private path into the worker.
- ADR 0018 and ADR 0024: strata-sim and strata-debug ship only in the worker, and the facade imports neither.
- Determinism: a run in the worker and a run in Node, given the same input and seed, have the same hash (eng §13, eng §18).
- The watchdog (spec §8) stops a worker that is silent for 2 s while requests wait, so a long `runToEnd` must keep proving it is alive.
- Plain data only: breakpoints, edits and results cross the boundary as structured-clone data, never as functions.

## Considered options

1. **Run sessions, one message per control.** The worker keeps runs by id. Each control is a request, and each reply carries a view of the moment the run stopped at.
2. **In-process first.** The sim host interface gains a `start` method that returns a control object. `inProcessSimHost` implements it with strata-sim in the calling thread, and the worker host gets it later.
3. **A generic call.** One message type, `{ type: 'run.call', payload: { run, method, args } }`, calls any method of the run's control by name, from an allow-list.

## Decision outcome

Chosen option: 1, decided by the human on 2026-10-02, with views for the synchronous reads of spec §18. The protocol stays at version 1, because the new types are additive and the facade and the worker always come from the same build. An older worker answers the new types with `E_PROTOCOL_UNKNOWN_TYPE`.

```
→ run.start   { input, durationMs, speed }       input: planRun's nodes and edges, with seed,
                                                  scope, stubs, inject, inspect, record and
                                                  snapshotEvery; behaviours by type id, from load
← run.view    View
→ run.control { run, action, args }               action: play, pause, stop, restart, runToEnd,
                                                  step, seek, setSpeed, follow, stepInto,
                                                  stepOut, edit, resume, replayFromHere,
                                                  restartWithChanges, keepInModel, discard,
                                                  setBreakpoint, clearBreakpoints
← run.view    View                                the moment the action left the run at
→ run.read    { run, what, args }                 what: spans, metrics, logs, hops, methodStack,
                                                  effectiveProps, runs, compare
← run.data    { chunk, of, data }                 at most 64 KB a chunk (eng §13)
← run.view    View, id null                       while playing, at most every 100 ms of wall time
← heartbeat   { run }                             every 250 ms of wall time inside a long action
→ run.close   { run }                             drops the run and its branches
```

A `View` is plain data: the run's id and state (ready, playing, paused, finished or stopped), its position (`{ event, timeUs }`), the followed trace and frame, the run tree, the state of every component at that moment, and its metric totals. Breakpoints travel as strata-debug's specs (`{ on: 'call', node, method }`), and strata-debug matches them in the worker. `replayFromHere` answers with the branch's view, under a new run id.

On the main thread, a run handle keeps the latest view. `run.state(node)` reads it synchronously. `run.edit(node, edit)` checks the view's state (paused), records the edit, and sends it ahead of the next request; the host keeps requests in order. `strata.sim.compare(a, b)` compares two views, each at its own moment. With a moment given (`{ event }` or `{ timeUs }`), it is async and moves both runs there first, as strata-sim's `compareRuns` does. Every other control is async and resolves with the handle once the new view arrives.

`inProcessSimHost` answers the same messages in the calling thread, so Node scripts, Node tests and the browser worker exercise one protocol. The determinism suite compares the run hash from each.

## Consequences

- Good: one protocol for the UI and the console, as spec §13 asks, and the worker bundle carries everything a run needs.
- Good: views make the synchronous reads of spec §18's example possible without a round trip.
- Bad: every view copies every component's state across the boundary. Large models need the 64 KB chunking from the start, and 0417 measures it.
- Bad: the facade grows a run handle and a debug namespace, which count against the core budget (252.8 KB of 255 KB).
- Follow-up tasks: 0417 adds the messages, the worker's run sessions with heartbeats, and the facade's run handles. 0429, split from 0417 by the human, adds `strata.debug.*`, bundles strata-debug into the worker (ADR 0024) and runs the determinism suite across engines.

## Pros and cons of the options

### Option 1: run sessions

- Good, because each control is a named, versioned message, which the UI and the console share.
- Good, because the worker's run heartbeat lets the watchdog tell a long run from a hung method.
- Bad, because it is the largest protocol change so far.

### Option 2: in-process first

- Good, because it is the least code now.
- Bad, because the browser cannot run a controlled simulation until the worker catches up, so the cross-engine determinism test cannot run there.
- Bad, because Node and the browser would take different paths, against spec §13.

### Option 3: a generic call

- Good, because the protocol has one new message type.
- Bad, because the protocol becomes whatever the control class exposes, so a refactor of strata-sim changes the protocol without anyone deciding it.
- Bad, because function arguments, such as breakpoint predicates, cannot cross anyway, so an allow-list and argument rules are needed regardless.
