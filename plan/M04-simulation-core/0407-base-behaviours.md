# 0407 Base behaviours

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0404](../M04-simulation-core/0404-state-runtime.md), [0405](../M04-simulation-core/0405-edges-network.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Behaviour API
- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md): State and methods

## Goal

Declarative base behaviours with state, public methods and cost models: `base:client`, `service`, `queue`, `topic`, `store`, `cache`, `proxy`, `timer`, `external` and `system`.

## Tests to write first

Write these tests first, in `packages/sim/test/base-behaviours.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Each base behaviour answers its public methods using the cost model from its properties
- [x] A manifest with `extends` and no `entry` simulates without any code
- [x] An `entry` method overrides the base method of the same name

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Where they live.** As the human decided on 2026-09-30, base behaviours live in strata-sim (`packages/sim/src/base.js`), so they ship only in the worker (ADR 0018). Each carries the state fields its methods use and, per method, the properties that hold its latency. The run merges them under the component's own: the manifest's state fields and latencies, and the entry's methods, win. Core's base manifests are unchanged, so the model and inspector list a base's state fields only once a run has them. Methods stay declared by component manifests, as the starter ones already do. A base's `any` answers the other public methods a component declares.
- **Cost models.** Each base behaviour is deliberately small, covering its methods, the state they need and one or two properties. Overflow policies, visibility timeouts, queueing on instances × concurrency, circuit breakers, eviction, rate limits and cron are the starter tasks' (0408 to 0411). `base:system` is the contract model of 0406, which answers any System run as a black box.
- **Proxies.** As the human decided on 2026-09-30, ADR 0019 gained an amendment. An edge that names a method also carries messages that name none, which then call its method. So `base:proxy` forwards with no method, and the edge's route rules and method decide where it goes (test in `packages/sim/test/network.test.js`).
- **Earlier tests.** As the human agreed on 2026-09-30, two earlier tests changed only their setup, with the same assertions. The 0403 test of a method without behaviour now uses a component that extends `base:component`, the abstract root, since `base:service` now answers any endpoint. The 0404 test of initial state does the same, since `base:store` now adds its `items`. Core's error-code scanner no longer counts a member call such as `ctx.fail('QUEUE_FULL')` as Strata raising a code: those are components' own failure codes (spec §8), and 0403 sends them as a `CallError`.
- **Beyond the listed tests.** The first listed test is one test per base type. `base:client` has none to answer.
