# 0018 Simulation code ships only in the worker bundle

Status: Accepted
Date: 2026-09-29

## Context and problem

Eng §15 budgets "Core, facade and non-UI packages (minified)" at 255 KB and the "Simulation worker bundle (minified)" at 120 KB. The first line measured every non-UI package's source, strata-sim included. The second measures the bundle the worker runs, which is mostly strata-sim. So simulation code counted twice.

It did ship twice. The facade imported strata-sim for its default host, which ran the kernel in the calling thread. So the app's main-thread bundle carried the kernel although the app runs simulations in its Blob-URL worker (spec §8, §11).

M04 adds most of the simulator to strata-sim. Task 0401's kernel took the core measure to 257.5 KB. As the human decided on 2026-09-29, 0401 recorded an exception, owned by a new task, 0418, which keeps strata-sim to the worker. Task 0402's host, session and sandbox then took the measure to 263.8 KB.

## Decision drivers

- Spec §21's 600 KB total for core and UI on the main thread, which eng §15's three code lines enforce.
- Spec §8 and §11: simulations run in a worker. The page needs to send messages to it, not to run the kernel.
- Eng §6: the facade may import strata-sim, but main-thread code gains nothing from it.

## Considered options

1. **strata-sim ships only in the worker bundle.** The facade reaches the simulator only through the host it is given, and never imports strata-sim. The core measure leaves strata-sim out, and the worker bundle line measures it.
2. **Raise the core budget again**, taking room from strata-ui, as ADR 0017 did.
3. **Keep the exception and grow it with every M04 task.**

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-29, when they chose an exception for 0401 owned by a task that keeps strata-sim to the worker, because:

- Each line then measures what ships where it runs. The main thread carries no kernel, and the worker bundle carries all of it.
- The worker line has room for M04: after 0402, the bundle measures 29.3 KB of its 120 KB.
- The budgets keep their meaning; nothing moves between lines.

## Consequences

- Good: core, facade and the non-UI packages measure 253.2 KB of 255 KB, with no exception.
- Good: the app's main-thread bundle carries no strata-sim module, which `tools/test/build.test.js` checks.
- Good: strata-sim can grow through M04 against the worker's 120 KB alone.
- Bad: `createStrata()` without a `simHost` can no longer simulate: `strata.sim.start` fails with `E_SIM_NO_HOST`. Node scripts and tests pass strata-sim's `inProcessSimHost`, and the CLI will pass a `worker_threads` host (strata-server's `spawnThreadWorker`) when it runs simulations.
- Bad: the page's host (`createSimHost`) moved from strata-sim to the facade, and the protocol version from strata-sim to core (`SIM_PROTOCOL_VERSION`), so that the page and the worker share it without importing each other.
- Neutral: strata-debug and strata-test may import strata-sim (eng §6). Their main-thread parts must reach it through the host too.
- Follow-up tasks: none. Task 0418 made the change, and eng §15 notes it.

## Pros and cons of the options

### Option 1: strata-sim ships only in the worker bundle

- Good, because the measures match what ships.
- Good, because the main-thread bundle shrinks.
- Bad, because Node callers must pass a host.

### Option 2: raise the core budget

- Good, because nothing else changes.
- Bad, because the kernel still ships on the main thread for nothing.
- Bad, because M04 would need more room still, and strata-ui has M05 ahead.

### Option 3: keep growing the exception

- Good, because it defers the question.
- Bad, because the exception would grow with every M04 task, and the budget would mean nothing.
