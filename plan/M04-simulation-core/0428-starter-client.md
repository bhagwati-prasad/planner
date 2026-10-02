# 0428 Starter library: client

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0427](../M04-simulation-core/0427-starter-identity-provider.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Sources and load

## Goal

The client, complete per spec §9: a population of users in concurrent sessions, each running a scenario from the scenario mix, step by step with think time, timeouts, retries and the client's own network.

## Tests to write first

Write these tests first, in `components/client/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A client runs a multi-step scenario that extracts a token and reuses it

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0411 on 2026-10-01, as the human decided. It keeps 0411's client test.
- **Scenarios.** As the human decided on 2026-10-01, the client gains a `scenarios` property in a minimal format. It maps a name to steps, each with a call (`out` or `out.method`), a path, headers, a body with `${var}` substitution, `extract` (variables from `$.path`s of the response) and think time. 0801 adds checks, the form editor and the JSON view on top of it.
- **Format.** Each step has `call` (`out`, or `out.method`), `path`, `headers`, `body`, `extract` (by variable name, a `$.path` of dotted keys and `[n]` indexes) and `think` (ms or a distribution). A value that is exactly `${name}` keeps the variable's type. `${user}` is a user drawn from `population` for each scenario run. The manifest gains an explicit `out` port, since runComponent reads a manifest's own ports.
- **Load.** Sessions run in a closed loop, and all `concurrency` of them start at time 0. Load profiles (0802) will shape arrivals. A step that runs out of retries abandons its scenario. Without scenarios, each session sends one request on `out` per think time, so a client runs as it comes.
- **Network.** The client's network adds one `networkLatency` sample per attempt, plus its body's JSON at `networkBandwidth` when that is above 0. A lost attempt waits out `clientTimeout`.
- **endToEnd.p99.** The kernel reports no percentiles yet (0804), so the client keeps a histogram of end-to-end latency in its state, with 16 buckets per doubling, about 6% wide, as spec §11 "Outputs" describes. It reports the p99's bucket top after each step.
- **Not modelled.** Inline checks (0801) and cookies.
