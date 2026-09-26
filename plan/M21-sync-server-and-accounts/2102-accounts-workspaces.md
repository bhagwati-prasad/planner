# 2102 Accounts and workspaces

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M21 Sync server and accounts](../ROADMAP.md#m21-sync-server-and-accounts) | R4 | todo | [2101](../M21-sync-server-and-accounts/2101-server-foundation.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4

## Goal

Accounts with password hashing via `node:crypto` scrypt, sessions, workspaces and invitations.

## Tests to write first

Write these tests first, in `packages/server/test/accounts.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Passwords are stored only as scrypt hashes with per-user salts
- [ ] Sessions expire and can be revoked
- [ ] An invitation joins a user to a workspace with the chosen role

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
