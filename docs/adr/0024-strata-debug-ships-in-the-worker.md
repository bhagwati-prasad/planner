# 0024 strata-debug ships in the simulation worker

Status: Accepted
Date: 2026-10-02

## Context and problem

Task 0416 builds the debugger in strata-debug: breakpoints on calls, arrivals, departures, edges and logs; hop inspection; the method stack; and effective properties (spec §13). Every one of them reads or drives a run, which lives in the simulation worker (ADR 0018). The size check counts strata-debug with core, the facade and the other non-UI packages, whose budget is 255 KB (eng §15, ADR 0017). It adds 2.7 KB and takes that measure to 255.5 KB. Spec §13 says the facade and the worker share one debugger protocol. ADR 0018 already moved strata-sim out of this measure, because only the worker bundle carries it. Where strata-debug ships, and which budget it counts against, is the human's decision (CLAUDE.md, "Ask the human first").

## Decision drivers

- Keep each budget honest: count code where it ships.
- Spec §13: the UI and the console debug through one protocol between facade and worker.
- ADR 0018: simulation code ships only in the worker bundle.
- Leave room in the core budget for the facade work in 0417 and later.

## Considered options

1. **strata-debug ships in the worker.** Like strata-sim, strata-debug is measured with the worker bundle (120 KB budget, now 30.8 KB), not with core. The facade reaches it through the worker protocol in task 0417, as spec §13 describes. The boundary rules stay: debug may import sim and core.
2. **Raise the core budget** to 260 KB (an ADR 0017 amendment), and keep strata-debug where it is counted now.
3. **Make room in core.** Find 0.5 KB or more elsewhere in core, facade and the non-UI packages before 0416 lands.

## Decision outcome

Chosen option: 1, decided by the human on 2026-10-02. The debugger acts on a run, so it lives where runs live. It is the facade's part of the protocol (0417) that will count against the core budget.

## Consequences

- Good: the core budget keeps its room for the facade, and the debugger has the worker's.
- Good: it matches spec §13's protocol between facade and worker, and ADR 0018.
- Bad: the size check's rule for which packages count with core changes again, and eng §15 says so.
- Follow-up tasks: 0416 removes strata-debug from the core measure. 0417 bundles it into the worker and adds the facade side of the protocol.

## Pros and cons of the options

### Option 1: the worker

- Good, because each budget counts the code that ships there.
- Bad, because the main thread cannot run the debugger without a worker, which it cannot run a simulation without either.

### Option 2: a larger core budget

- Good, because nothing moves.
- Bad, because it spends core budget on code the main thread never needs.

### Option 3: room in core

- Good, because the budget holds.
- Bad, because 0417 adds facade code to core soon, so the room would not last.
