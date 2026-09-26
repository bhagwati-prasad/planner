# 1802 Semantic merge driver

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M18 Project folder and merge](../ROADMAP.md#m18-project-folder-and-merge) | R3 | todo | [1801](../M18-project-folder-and-merge/1801-folder-format.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R3

## Goal

`strata merge` as a git merge driver that replays commands from both sides, merging non-conflicting changes and turning conflicts into reviewable items.

## Tests to write first

Write these tests first, in `packages/cli/test/merge.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Independent edits on two branches merge without conflicts
- [ ] Two edits to the same property produce one conflict item showing both values
- [ ] The merged result passes graph and binding validation

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
