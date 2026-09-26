# 2503 Public API and webhooks

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M25 Registry, runs and API](../ROADMAP.md#m25-registry-runs-and-api) | R5 | todo | [2502](../M25-registry-runs-and-api/2502-run-service.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R5

## Goal

A REST API with API keys and webhooks for test failed, ADR accepted and review requested.

## Tests to write first

Write these tests first, in `packages/server/test/api.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The API matches its published OpenAPI document (contract test)
- [ ] Webhooks are signed and retried with backoff
- [ ] API keys can be scoped and revoked

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
