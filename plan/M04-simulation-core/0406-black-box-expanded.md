# 0406 Black-box and expanded composites

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0403](../M04-simulation-core/0403-ctx-dispatch.md), [0112](../M01-core/0112-extract-inline.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): Black box or expanded
- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Black-box models for composites

## Goal

Run each composite in either mode: expanded dispatch goes through bindings into the inner system; black box uses the component's behaviour or its contract.

## Tests to write first

Write these tests first, in `packages/sim/test/composite.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] The same request through the recursive fixture succeeds with each composite in either mode
- [x] Expanded mode records spans inside the inner system; black box records one span
- [x] Calling an unbound method in expanded mode fails with `E_METHOD_UNBOUND`

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Where it lives.** `packages/sim/src/plan.js` (`planRun`) turns the model into a run's nodes and edges, and `packages/sim/src/run.js` dispatches through composites. A component in a run is named by its path of node ids from the root, so a system placed by reference in two places runs as two sets of components.
- **Modes.** A run chooses each composite's mode by path. By default a System runs expanded and a component opened as a system as a black box, since spec §7 keeps its behaviour as its black-box model "until the inner system is complete and a run chooses Expanded". Spec §5's `runMode` on a component instance is not in the model yet; adding it changes the `.strata` format, so it needs its own decision.
- **One level at a time.** Core's `resolveBinding` gained a `levels` option, so a run resolves each composite's binding one level down and each inner composite's own mode decides whether to go further (test in `packages/core/test/bindings.test.js`). An expanded composite records no span of its own: the component its binding names is a child of the caller's span, as with any call.
- **Contracts.** A black box with no behaviour of its own, such as a System, answers from its contract: an empty answer (`null`) after the service time it bounds, `serviceTime` or one of its statistics, as a constant; with none, at once. Calibration from expanded runs comes in 0903.
- **Beyond the listed tests.** Tests cover a System answering from its contract, and a message leaving an expanded composite through its out port (a model built through commands with `system.extract`).
- **Base behaviours** are 0407's, so the tests give behaviours for the fixture's types.
