# 0110 Inner systems, boundary ports and the resolver

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0109](../M01-core/0109-graph-model.md) |

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md)
- [Engineering §9 Recursion rules](../../docs/guidelines/engineering/09-recursion-rules.md)

## Goal

`component.openAsSystem`, boundary ports that mirror the owner's ports, `resolveSystem`, `walk` with `maxDepth`, cycle and depth guards, and read-only by-reference inner systems.

## Tests to write first

Write these tests first, in `packages/core/test/recursion.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Opening a component as a system creates boundary ports matching its ports one to one
- [ ] Adding a port to the owner adds a boundary port in the same batch
- [ ] A placement that creates a cycle fails with `E_SYSTEM_CYCLE`
- [ ] Editing inside a by-reference inner system fails with `E_SYSTEM_READONLY`
- [ ] `walk` visits every component of a three-level graph exactly once and honours `maxDepth`

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
