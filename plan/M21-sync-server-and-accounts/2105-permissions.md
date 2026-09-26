# 2105 Roles and system-level permissions

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M21 Sync server and accounts](../ROADMAP.md#m21-sync-server-and-accounts) | R4 | todo | [2103](../M21-sync-server-and-accounts/2103-oplog-sync.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): Permissions
- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4

## Goal

Owner, Editor, Commenter and Viewer roles, enforced on the server, per workspace and per system.

## Tests to write first

Write these tests first, in `packages/server/test/permissions.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A commenter's edit command is rejected by the server
- [ ] A team can own one system while others only comment on it
- [ ] Permission checks apply to every command type (table-driven test)

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
