# 1902 Visual diff

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M19 Versions, diff and what-if](../ROADMAP.md#m19-versions-diff-and-what-if) | R3 | todo | [1901](../M19-versions-diff-and-what-if/1901-model-snapshots.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R3
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md)

## Goal

Canvas diff between any two snapshots or branches, per system and across levels, with property, state and method differences.

## Tests to write first

Write these tests first, in `packages/ui/test/diff.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Added, removed and changed components are marked on the canvas
- [ ] Drilling into a changed composite shows the changes inside
- [ ] The diff list and the canvas stay in sync

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
