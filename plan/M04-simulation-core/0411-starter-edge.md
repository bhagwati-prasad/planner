# 0411 Starter library: edge, clients and external

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

CDN, DNS, client, auth provider, scheduler, third-party API, external stub and the generic System component, complete per spec §9.

## Tests to write first

Write these tests first, in `components/cdn/tests`, `components/dns/tests`, `components/client/tests`, `components/auth-provider/tests`, `components/scheduler/tests`, `components/third-party-api/tests`, `components/external-system/tests`, `components/system/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A client runs a multi-step scenario that extracts a token and reuses it
- [ ] The scheduler fires on its cron expression in simulated time
- [ ] The third-party API returns 429 above its rate limit
- [ ] The generic System answers calls through its contract when run as a black box

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
