# 1903 What-if branches

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M19 Versions, diff and what-if](../ROADMAP.md#m19-versions-diff-and-what-if) | R3 | todo | [1901](../M19-versions-diff-and-what-if/1901-model-snapshots.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R3

## Goal

Model branches inside one project for comparing alternatives, with runs comparable across branches.

## Tests to write first

Write these tests first, in `packages/core/test/what-if.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Switching branches changes the model without touching other branches
- [ ] Runs from two branches compare side by side
- [ ] A branch can be merged back through the merge engine

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
