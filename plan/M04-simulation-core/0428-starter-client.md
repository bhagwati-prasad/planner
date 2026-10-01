# 0428 Starter library: client

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0427](../M04-simulation-core/0427-starter-identity-provider.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Sources and load

## Goal

The client, complete per spec §9: a population of users in concurrent sessions, each running a scenario from the scenario mix, step by step with think time, timeouts, retries and the client's own network.

## Tests to write first

Write these tests first, in `components/client/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A client runs a multi-step scenario that extracts a token and reuses it

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0411 on 2026-10-01, as the human decided. It keeps 0411's client test.
- **Scenarios.** As the human decided on 2026-10-01, the client gains a `scenarios` property in a minimal format. It maps a name to steps, each with a call (`out` or `out.method`), a path, headers, a body with `${var}` substitution, `extract` (variables from `$.path`s of the response) and think time. 0801 adds checks, the form editor and the JSON view on top of it.
