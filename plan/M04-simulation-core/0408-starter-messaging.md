# 0408 Starter library: messaging and workers

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

Message queue, pub/sub topic and worker pool with every property, state field, method and metric from spec §9.

## Tests to write first

Write these tests first, in `components/message-queue/tests`, `components/topic/tests`, `components/worker-pool/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each component's self-tests cover every public method and every declared error
- [ ] The queue expires messages at the right simulated time and respects its overflow policy
- [ ] The topic reports consumer lag per consumer group

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
