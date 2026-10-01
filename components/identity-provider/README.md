# Auth / identity provider

Issues and validates tokens (Auth0, Cognito, Keycloak, Entra ID).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:service`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `tokenIssueLatency` | distribution (ms) | `{"kind":"lognormal","median":30,"p99":200}` | Tokens |  |
| `tokenTtl` | duration | `1h` | Tokens |  |
| `validationMode` | enum | `local-jwt` | Validation |  |
| `validationLatency` | distribution (ms) | `{"kind":"lognormal","median":1,"p99":5}` | Validation |  |
| `rateLimit` | rate | `500/s` | Limits |  |
| `mfaStepUpProbability` | percent (%) | `2` | Limits |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `validationLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `validationLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `validationLatency.p99` until simulation measures it |
| `authRequests` | req/s | sum |  |
| `failures` | req/s | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `tokens` | map | By token: the subject of each live token, one neither expired nor revoked, and when it expires, in ms |
| `sessions` | map | By subject: its live tokens, and whether an MFA challenge is open |
| `issued` | integer | Tokens issued so far |
| `window` | map | The second requests are counted in, and how many it has accepted in it |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `issueToken` | `{ subject, otp? }` | `{ token, subject, expiresAt }` | `TOO_MANY_REQUESTS`, `MFA_REQUIRED` |
| `validateToken` | `{ token }` | `{ active: true, subject, expiresAt }` | `TOO_MANY_REQUESTS`, `INVALID_TOKEN` |
| `revoke` | `{ token }` or `{ subject }` | `{ revoked }`, how many tokens it revoked | `TOO_MANY_REQUESTS` |

Private: `mfaChallenge`.

## Behaviour

- **Tokens.** A token carries its subject and expiry, as a JWT does, and lives for `tokenTtl`. Issuing one takes a sample of `tokenIssueLatency`.
- **Validation.** Validating takes a sample of `validationLatency`. A token the provider did not issue fails with `INVALID_TOKEN` and the reason `unknown`, and an expired one with `expired`. With `local-jwt`, a relying party checks the signature and expiry alone, so a revoked token stays valid until it expires. With `introspection`, the provider is asked, and a revoked token fails with `revoked`.
- **Revocation.** `revoke` takes one token, or every live token of a subject, out of the live tokens.
- **MFA step-up.** A login is challenged at `mfaStepUpProbability` and fails with `MFA_REQUIRED`, which opens a challenge for its subject. Its logins keep failing so until one answers with an `otp`. A password with no challenge open answers nothing.
- **Rate limit.** Each request that reaches the provider counts against `rateLimit` each second: every request but a local validation. The rest fail at once with `TOO_MANY_REQUESTS`, status 429.
- **Metrics.** Each request reports `1` for `authRequests`, and each error response `1` for `failures`.
- **Not modelled yet.** The `out` port is not used. Availability does not fail requests.
