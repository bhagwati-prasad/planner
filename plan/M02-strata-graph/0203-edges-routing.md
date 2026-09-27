# 0203 Edges, arrowheads and routing

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0202](../M02-strata-graph/0202-shapes-ports.md), [0210](../M02-strata-graph/0210-visual-harness.md) |

## Read first

- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Connections

## Goal

Straight, orthogonal (avoiding components) and curved routing; line style and arrowhead per connection kind; label pills; waypoints; method labels.

## Tests to write first

Write these tests first, in `packages/graph/test/edges.spec.js`, `packages/graph/test/router.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Property: the orthogonal router never passes through a component's bounds
- [ ] Each connection kind matches its visual snapshot
- [ ] Parallel edges between the same pair are offset so both are visible
- [ ] An edge bound to a method shows the method name in its label

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
