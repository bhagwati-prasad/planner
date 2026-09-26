# 2501 Component registry

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M25 Registry, runs and API](../ROADMAP.md#m25-registry-runs-and-api) | R5 | todo | [2401](../M24-multi-tenancy-and-identity/2401-tenancy.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R5
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

Organisation-private and public component catalogues with signed bundles, versions and usage counts, installable from the library panel.

## Tests to write first

Write these tests first, in `packages/server/test/registry.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A bundle with an invalid signature can't be installed
- [ ] Installing pins the exact version in the project
- [ ] Private components are invisible outside their organisation

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
