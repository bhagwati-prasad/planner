# 1705 Quarantine mode for untrusted components

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M17 Visual extras and R2 release](../ROADMAP.md#m17-visual-extras-and-r2-release) | R2 | todo | [0402](../M04-simulation-core/0402-worker-host.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Sandbox

## Goal

Run an untrusted component in its own worker behind a message proxy.

## Tests to write first

Write these tests first, in `packages/sim/test/quarantine.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A quarantined component's results match a normal run's run hash
- [ ] A quarantined component can't read other components' state

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
