# 2502 Server-side run service

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M25 Registry, runs and API](../ROADMAP.md#m25-registry-runs-and-api) | R5 | todo | [2401](../M24-multi-tenancy-and-identity/2401-tenancy.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R5

## Goal

Isolated server workers that run simulations and tests for CI, with results matching local run hashes.

## Tests to write first

Write these tests first, in `packages/server/test/run-service.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A server-side run has the same run hash as the same run locally
- [ ] Runs are isolated per tenant and killed at their time limit

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
