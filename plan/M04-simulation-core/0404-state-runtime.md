# 0404 Typed state at run time

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0403](../M04-simulation-core/0403-ctx-dispatch.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): State

## Goal

Initialise state from manifest defaults, instance overrides and fixtures; enforce typed containers; record every change for the debugger.

## Tests to write first

Write these tests first, in `packages/sim/test/state.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Instance initial state overrides the manifest's initial values
- [ ] `queue`, `list`, `map` and `table` enforce their shapes
- [ ] Every state change is recorded with its event number and method span

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
