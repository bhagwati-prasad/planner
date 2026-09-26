# 2101 Server foundation

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M21 Sync server and accounts](../ROADMAP.md#m21-sync-server-and-accounts) | R4 | todo | [2005](../M20-integrations-cost-and-planning/2005-r3-exit.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

A Node server with HTTP, WebSocket, project storage and health checks, deployable with one command.

## Tests to write first

Write these tests first, in `packages/server/test/foundation.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The server passes a WebSocket conformance subset (framing, ping, close)
- [ ] Projects persist across restarts
- [ ] The security headers and Origin checks from eng §16 apply

## Notes

- Write an ADR first on server storage (filesystem op logs are zero-dependency) and on whether any server dependency is allowed.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
