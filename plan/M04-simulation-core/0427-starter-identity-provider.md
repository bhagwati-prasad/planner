# 0427 Starter library: identity provider

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0426](../M04-simulation-core/0426-starter-cdn-dns.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The identity provider, complete per spec §9: tokens issued and validated with their latencies and TTL, local or remote validation, revocation, rate limits and MFA step-up.

## Tests to write first

Write these tests first, in `components/identity-provider/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A token issued validates until its TTL, and fails once revoked

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0411 on 2026-10-01, as the human decided.
- **Tokens.** A token reads `tok.<number>.<expiresAt>.<subject>`, so local JWT validation needs no state, as a real JWT's signature and claims need none. Local validation therefore cannot see a revocation; introspection can.
- **Rate limit.** Local validations do not count against `rateLimit`, since they would never reach the provider. Refusals answer `TOO_MANY_REQUESTS` with status 429, as the third-party API's do.
- **MFA.** The spec gives a step-up probability and no challenge duration. A challenged login fails with `MFA_REQUIRED`, and the subject's next login passes with an `otp`, so a client scenario can model the user's delay itself.
- **Not modelled.** The `out` port is unused, and the common `availabilityTarget` does not fail requests.
