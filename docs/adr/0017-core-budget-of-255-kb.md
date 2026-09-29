# 0017 Core, facade and the non-UI packages have a budget of 255 KB

Status: Accepted
Date: 2026-09-29

## Context and problem

Eng §15 budgets "Core, facade and non-UI packages (minified)" at 250 KB. Spec §21 caps core and UI together at 600 KB minified, excluding D3, and eng §15's three code lines add up to that total:
- 250 KB for core;
- 115 KB for strata-graph ([ADR 0016](0016-strata-graph-budget-of-115-kb.md));
- 235 KB for strata-ui.

Task 0119 brought the measure back under 250 KB by shortening local names in the minifier. Tasks 0301 and 0302 took it to 247.0 KB.

Task 0303 adds the behaviour contract of spec §8 and eng §10 to strata-plugins, in `behaviour.js`:
- the `ctx` interface as JSDoc types;
- `validateBehaviour`, which checks a behaviour module against its manifest;
- `checkModuleState`, which flags module-level mutable state in a module's source;
- `createTestContext`, which lets component authors unit-test methods without the kernel.

That adds about 6.5 KB, and the measure reaches 253.5 KB.

strata-ui measures 78.7 KB of its 235 KB.

## Decision drivers

- Spec §21's 600 KB total for core and UI, which eng §15's three lines enforce.
- A budget CI enforces and code can meet. Under the human's 2026-09-27 policy, going past 250 KB means an exception and a task that brings the measure back, and no known change brings back 3.5 KB.
- strata-plugins runs in the browser too: the upload dialog validates what people upload.

## Considered options

1. **255 KB for core, and 230 KB for strata-ui.** The 600 KB total of spec §21 stays as it is.
2. **An exception at 253.5 KB, owned by a new task: the minifier shortens private class member names.** That saves about 3.3 KB of this measure, to about 250.2 KB, which is still over. It would also save about 4 KB in strata-graph.
3. **Move `createTestContext` and `checkModuleState` to strata-cli**, which runs only in Node and is outside the browser budget. The measure falls to about 249 KB, but the upload dialog can no longer flag module-level state.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-29, because:

- It is the smallest change: two lines of eng §15, as in ADRs 0014 and 0016. Spec §21 is untouched.
- strata-ui keeps 151 KB of room above what it measures.
- The behaviour contract stays where both the browser and the CLI can use it.

## Consequences

- Good: 0303 finishes without an exception, and CI holds core to a limit it meets.
- Good: eng §15's three lines still add up to spec §21's 600 KB.
- Bad: core has about 1.5 KB of room, and M03 to M05 add core features, so the question will come back.
- Bad: strata-ui has 5 KB less room before M05's shell and M10's debugger.
- Neutral: option 2 stays open, as its own task, and would help core and strata-graph.
- Follow-up tasks: none. The change that accepted this ADR set eng §15 to 255 KB for core and 230 KB for strata-ui.

## Pros and cons of the options

### Option 1: 255 KB for core, and 230 KB for strata-ui

- Good, because spec §21's total holds, and nothing but two budget lines changes.
- Bad, because the budget moves rather than the code shrinking, for the third time since M02 began.

### Option 2: an exception, owned by a minifier task

- Good, because every package gets smaller, and the budgets keep their meaning.
- Bad, because it does not get the measure under 250 KB alone.
- Bad, because it changes the minifier that also packs user plugins.

### Option 3: move the author tooling to strata-cli

- Good, because the measure falls under 250 KB with no budget change.
- Bad, because the browser's upload dialog loses the module-state check.
- Bad, because in-app component tests could not use the test context.
