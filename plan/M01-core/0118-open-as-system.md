# 0118 Open a component as a system

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0117](../M01-core/0117-typed-nodes.md) |

## Read first

- [ADR 0009 Every node is a typed component that may own an inner system](../../docs/adr/0009-every-node-is-a-typed-component.md)
- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Opening any component as a system, Boundary ports and method bindings

## Goal

`component.openAsSystem` gives any component an inner system of its own whose boundary ports mirror the component's ports, and port commands on the owner keep them in step. The component keeps its type and behaviour as its black-box model.

## Tests to write first

Write these tests first, in `packages/core/test/open-as-system.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Opening a component as a system creates boundary ports matching its ports one to one
- [ ] Adding a port to the owner adds a boundary port in the same batch
- [ ] The opened component keeps its `typeRef` and properties, and removing its inner system leaves it a black box only

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
