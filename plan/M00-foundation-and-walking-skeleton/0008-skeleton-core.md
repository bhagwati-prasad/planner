# 0008 Walking skeleton: minimal model and command bus

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | todo | [0004](../M00-foundation-and-walking-skeleton/0004-test-harness.md) |

## Read first

- [Spec §5 Domain model](../../docs/spec/05-domain-model.md)
- [Engineering §7 State, commands and events](../../docs/guidelines/engineering/07-state-commands-and-events.md)

## Goal

The thinnest real core: a project with one system, `component.add` and `edge.add` commands through a simple bus, undo, and `createStrata()` exposing them.

## Tests to write first

Write these tests first, in `packages/core/test/skeleton.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Adding two components and an edge yields a graph with 2 components and 1 edge
- [ ] Undo removes the edge, then the second component
- [ ] An edge to a missing port fails with `E_PORT_NOT_FOUND`

## Notes

- M01 replaces the internals; keep the public shapes from spec §18.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
