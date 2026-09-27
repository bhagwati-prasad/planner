# 0109 Graph model and invariants

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0105](../M01-core/0105-undo-batches.md), [0107](../M01-core/0107-schema-validator.md) |

## Read first

- [Spec §5 Domain model](../../docs/spec/05-domain-model.md): Graph invariants
- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md)

## Goal

Commands for component instances, ports and edges that enforce every graph invariant.

## Tests to write first

Write these tests first, in `packages/core/test/graph.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] An edge starting at an input-only port fails with `E_EDGE_DIRECTION`
- [x] A self-loop fails with `E_EDGE_SELF_LOOP`
- [x] Parallel edges between the same two components are allowed
- [x] An edge between components in different systems fails with `E_EDGE_CROSS_LEVEL`
- [x] Removing a component removes its edges in the same batch, and undo restores both

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
