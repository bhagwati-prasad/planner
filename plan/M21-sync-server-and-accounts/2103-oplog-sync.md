# 2103 Operation-log sync

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M21 Sync server and accounts](../ROADMAP.md#m21-sync-server-and-accounts) | R4 | todo | [2102](../M21-sync-server-and-accounts/2102-accounts-workspaces.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4: real-time sync
- [Engineering §7 State, commands and events](../../docs/guidelines/engineering/07-state-commands-and-events.md)

## Goal

Server-ordered op logs with optimistic client apply, rebase of pending commands, last-writer-wins conflicts with notices and restore, and an offline queue.

## Tests to write first

Write these tests first, in `packages/server/test/sync.test.js`, `packages/core/test/rebase.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Property: any interleaving of commands from three clients converges to the same state
- [ ] A same-field conflict shows a notice with one-click restore of the losing value
- [ ] Commands made offline rebase and apply on reconnect

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
