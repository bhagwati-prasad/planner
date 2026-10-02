# 0026 Budgets for run sessions: core 265 KB, the worker 160 KB

Status: Accepted
Date: 2026-10-02

## Context and problem

Task 0417 puts whole runs behind the worker protocol (ADR 0025), and two size budgets of eng §15 no longer hold:

| Measure | Before 0417 | With 0417 | Budget |
| --- | --- | --- | --- |
| Core, facade and non-UI packages | 252.8 KB | 263.7 KB | 255 KB |
| Simulation worker bundle | 30.8 KB | 149.9 KB | 120 KB |

**Core grows by 10.9 KB.**
- The facade gains run handles (`run.js`, 3.4 KB) and `strata.sim.start` and `compare` (sim.js grows by 3.8 KB).
- Planning a run from the model moves from strata-sim into core as `planModel` (3.3 KB). It reads the model, so it must run on the page, and ADR 0018 keeps strata-sim off the page.

**The worker grows by 119 KB.**
- Until now the worker bundle carried only the walking skeleton.
- Now it carries the kernel a run needs: `run.js`, `state.js`, `control.js`, base behaviours, routing, expressions and sampling (72 KB of strata-sim).
- It also carries the core modules those import, such as `normalizeManifest`, schema checks and distributions (66 KB).
- Task 0429 will add strata-debug, about 3 KB (ADR 0024).

Spec §21 caps core and UI together at 600 KB minified, excluding D3. Eng §15's core, strata-graph and strata-ui lines add up to that: 255, 115 and 230 KB. strata-ui measures 78.9 KB of its 230 KB. No spec line caps the worker. Its 120 KB budget is eng §15's own, from before the worker ran whole runs. Budgets are changed through an ADR (CLAUDE.md, "Ask the human first").

## Decision drivers

- Spec §21's 600 KB for core and UI together.
- Count code where it ships (ADR 0018, ADR 0024), and keep budgets that CI enforces and code can meet.
- The human's policy of 2026-09-27: going past a budget means an exception and a task that brings the measure back, unless an ADR changes the budget.
- Room for what comes next: strata-debug in the worker (0429), and the facade's side of the debugger (0429).

## Considered options

1. **Move 10 KB from strata-ui to core, and give the worker 160 KB.** Core becomes 265 KB and strata-ui 220 KB, so the three lines still sum to 600 KB, as ADR 0017 did. The worker budget, which no spec line caps, becomes 160 KB.
2. **Exceptions now, and a task to bring each back.** Record both measures in `tools/ci/size-exceptions.json`, where they may not grow, owned by a new task. That task would bring core back under 255 KB, by moving about 9 KB out of core and the facade, and the worker under 120 KB, by cutting about 30 KB of core modules it does not need.
3. **Make room before 0417 lands.** Do the work of option 2 inside 0417.

## Decision outcome

Chosen option: 1, decided by the human on 2026-10-02.

## Consequences

- Good: the budgets match the code that ships, and CI keeps both from growing past them.
- Good: spec §21's 600 KB total holds.
- Bad: strata-ui has 10 KB less room for the shell (M05), with 141 KB of its 220 KB still free.
- Bad: the worker takes longer to start from its Blob URL, by the time it takes to parse about 120 KB more script.
- Follow-up tasks: eng §15's table changes to 265, 220 and 160 KB; 0417 lands within them.

## Pros and cons of the options

### Option 1: move room to core, a larger worker budget

- Good, because nothing is cut that runs need, and the totals of spec §21 hold.
- Bad, because the worker's budget is now whatever whole runs needed in October 2026, not a target.

### Option 2: exceptions and a task

- Good, because the budgets stay as targets.
- Bad, because no known change brings back 9 KB of core or 30 KB of the worker without moving code the page or the kernel needs: `planModel` must run on the page, and the kernel needs manifests, schemas and distributions.

### Option 3: make room inside 0417

- Good, because nothing goes over budget, even for a while.
- Bad, because 0417 would grow by work that is not in its goal, after the human already split it once.
