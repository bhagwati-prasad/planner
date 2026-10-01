# 0411 Starter library: scheduler, third-party API and external stub

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

The scheduler, the third-party API and the external stub, complete per spec §9. The generic System, also in the old 0411, already answers through its contract as a black box (task 0406).

## Tests to write first

Write these tests first, in `components/scheduler/tests`, `components/third-party-api/tests`, `components/external-system/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The scheduler fires on its cron expression in simulated time
- [ ] The third-party API returns 429 above its rate limit
- [x] The generic System answers calls through its contract when run as a black box: covered by 0406's "answers as a black-box System from its contract" in `packages/sim/test/composite.test.js`

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** on 2026-10-01, as the human decided. The CDN and DNS became 0426, the identity provider 0427 and the client 0428. The System has no component folder: `strata.system` is built in, and 0406 runs it as a black box from its contract.
