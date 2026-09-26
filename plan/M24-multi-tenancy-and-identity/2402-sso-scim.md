# 2402 SSO and SCIM

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M24 Multi-tenancy and identity](../ROADMAP.md#m24-multi-tenancy-and-identity) | R5 | todo | [2401](../M24-multi-tenancy-and-identity/2401-tenancy.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R5

## Goal

OIDC and SAML sign-in and SCIM user provisioning.

## Tests to write first

Write these tests first, in `packages/server/test/sso.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] OIDC and SAML logins work against recorded identity-provider fixtures
- [ ] SCIM deprovisioning revokes sessions immediately

## Notes

- Needs an ADR on the SAML library, or an in-house implementation plan.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
