# 2604 Usage-based billing

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M26 Integrations, billing and launch](../ROADMAP.md#m26-integrations-billing-and-launch) | R5 | todo | [2401](../M24-multi-tenancy-and-identity/2401-tenancy.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R5

## Goal

Plans, usage metering (seats and server runs) and invoicing through a billing provider.

## Tests to write first

Write these tests first, in `packages/server/test/billing.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Usage totals match the metering events exactly
- [ ] A failed payment moves the organisation to read-only after the grace period

## Notes

- Needs an ADR choosing the billing provider.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
