# 0403 ctx API and method dispatch

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0402](../M04-simulation-core/0402-worker-host.md), [0111](../M01-core/0111-method-bindings.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md)
- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Behaviour API
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Method dispatch

## Goal

The real `ctx` (props, state, now, random, sample, call, send, emit, fail, schedule, metric, log), public-method dispatch by port and `msg.method`, private calls as child spans, and `ctx` promises resolved by kernel events.

## Tests to write first

Write these tests first, in `packages/sim/test/dispatch.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A message naming a method the port does not expose fails with `E_METHOD_NOT_EXPOSED`
- [x] Private methods can't be reached over an edge even when named explicitly
- [x] `await ctx.send` resumes at the simulated time the response arrives, while other messages keep processing
- [x] A private call with declared latency delays the caller's completion and appears as a child span
- [x] Writing an undeclared state field fails in development builds

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **The run.** `createRun({ seed, nodes, edges })` in `packages/sim/src/run.js` runs components with the real `ctx` over the kernel. Requests come in through `run.inject`, a unit-style injection (spec §11). The kernel gained `step()`, so the run can pause between events.
- **Resuming awaited methods.** Awaiting a `ctx` promise resumes the method in microtasks, which the kernel cannot run itself. So after an event that settles a `ctx` promise or starts an async method, the run lets microtasks run until eight turns pass with no progress, then takes its next event. The method therefore resumes at the event's simulated time, and a call left waiting on anything other than a `ctx` promise fails with `E_BEHAVIOUR_AWAIT` (a test).
- **Beyond the listed tests.** The goal names the whole `ctx`, so tests also cover:
  - `schedule` and `onTimer`, `emit` and `fail`;
  - `random` and `sample`, from the node's own stream with sim's `log` and `exp`;
  - `metric`, `log` and `props`;
  - the refusal codes, including `E_METHOD_FAILED` for a method that throws, now registered.
- **Failed responses.** A failed response travels as a `CallError`, since a component's own failure codes (from `ctx.fail`) are not Strata's. That test reproduced the crash first: in development builds a `StrataError` refuses unregistered codes.
- **How the red runs were shown.** The runtime was written in one piece after the tests, so each listed test was run against a copy with its feature switched off: the port check, the settling between events, private-call latency and the state check. Each failed as described.
- **Left for later tasks.** Typed state and recording changes are 0404's. Base behaviours for methods with no code are 0407's. Heartbeats every 250 ms during a run, and naming a method that hangs inside one, need the worker to drive a whole run, which 0414's run lifecycle does; 0402 had said they would come here.

