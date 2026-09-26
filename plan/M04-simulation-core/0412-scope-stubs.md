# 0412 Scopes, stubs and inbound traffic

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0406](../M04-simulation-core/0406-black-box-expanded.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Scope
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Method dispatch, scope and stubs

## Goal

The scope resolver (whole project, one system, selection, request path); fixed, recorded and black-box stubs; recorded inbound traffic.

## Tests to write first

Write these tests first, in `packages/sim/test/scope.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A selection scope instantiates only the selected components
- [ ] A fixed stub answers with its configured latency distribution and error rate
- [ ] A recorded stub replays responses from a wider run; an unmatched call fails with `E_STUB_NO_RECORDING`
- [ ] A request-path scope contains exactly the components a first trace run touched

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
