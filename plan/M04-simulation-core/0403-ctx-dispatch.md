# 0403 ctx API and method dispatch

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0402](../M04-simulation-core/0402-worker-host.md), [0111](../M01-core/0111-method-bindings.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md)
- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Behaviour API
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Method dispatch

## Goal

The real `ctx` (props, state, now, random, sample, call, send, emit, fail, schedule, metric, log), public-method dispatch by port and `msg.method`, private calls as child spans, and `ctx` promises resolved by kernel events.

## Tests to write first

Write these tests first, in `packages/sim/test/dispatch.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A message naming a method the port does not expose fails with `E_METHOD_NOT_EXPOSED`
- [ ] Private methods can't be reached over an edge even when named explicitly
- [ ] `await ctx.send` resumes at the simulated time the response arrives, while other messages keep processing
- [ ] A private call with declared latency delays the caller's completion and appears as a child span
- [ ] Writing an undeclared state field fails in development builds

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
