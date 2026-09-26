# 2201 Presence and follow mode

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M22 Live co-editing](../ROADMAP.md#m22-live-co-editing) | R4 | todo | [2103](../M21-sync-server-and-accounts/2103-oplog-sync.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md)

## Goal

Cursors, selections, avatars on the breadcrumb showing who is at which level, and follow mode.

## Tests to write first

Write these tests first, in `packages/ui/test/presence.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Two browser contexts see each other's cursors within 200 ms locally
- [ ] Follow mode tracks the other person's level and viewport
- [ ] Presence disappears within 10 s of disconnect

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
