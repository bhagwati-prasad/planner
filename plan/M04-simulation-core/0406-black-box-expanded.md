# 0406 Black-box and expanded composites

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0403](../M04-simulation-core/0403-ctx-dispatch.md), [0112](../M01-core/0112-extract-inline.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): Black box or expanded
- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Black-box models for composites

## Goal

Run each composite in either mode: expanded dispatch goes through bindings into the inner system; black box uses the component's behaviour or its contract.

## Tests to write first

Write these tests first, in `packages/sim/test/composite.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The same request through the recursive fixture succeeds with each composite in either mode
- [ ] Expanded mode records spans inside the inner system; black box records one span
- [ ] Calling an unbound method in expanded mode fails with `E_METHOD_UNBOUND`

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
