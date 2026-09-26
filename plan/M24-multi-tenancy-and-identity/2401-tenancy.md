# 2401 Organisations and tenant isolation

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M24 Multi-tenancy and identity](../ROADMAP.md#m24-multi-tenancy-and-identity) | R5 | todo | [2304](../M23-collaborative-comments-and-review/2304-r4-exit.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R5

## Goal

Organisations, a Postgres schema with row-level security, per-tenant encryption keys, and migration from R4 storage.

## Tests to write first

Write these tests first, in `packages/server/test/tenancy.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Queries from one tenant never return another tenant's rows (property test across generated tenants)
- [ ] Migrating an R4 workspace preserves every project's state hash

## Notes

- Needs an ADR approving a Postgres client dependency before starting.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
