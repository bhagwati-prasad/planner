# 0023 Time travel restores quiet snapshots and replays forward

Status: Accepted
Date: 2026-10-01

## Context and problem

Task 0413 steps back and seeks by restoring the nearest earlier snapshot and replaying forward (spec §12 "Scrubber and markers", §13, eng §13 "Snapshots, stepping and branches", ADR 0004). Eng §13 says a snapshot captures "all component state, pending events and PRNG positions" as structural copies. But behaviour methods are async functions (spec §8). A method awaiting `ctx.send` or `ctx.spend` is a suspended JavaScript continuation: its local variables and its place in the code live in the engine, in the reactions of the kernel's `Pending` promises. A server's waiting calls hold closures too. No structural copy can capture a continuation, so a snapshot taken while any method is suspended cannot be restored. The spec does not say what to do about this, and how snapshots work is kernel semantics (CLAUDE.md, "Ask the human first").

## Decision drivers

- Exact: a seek must give the true state at that moment, and stepping forward n then back n must restore an identical state hash (eng §13).
- Fast enough: stepping back one hop in a 60 s run under 100 ms (task 0413), and snapshots cost at most 10% of throughput (spec §21).
- Behaviour code stays as spec §8 has it: plain async functions over `ctx`.
- Memory is capped per run, 256 MB by default (eng §13).

## Considered options

1. **Quiet snapshots, replayed forward.** The run takes a snapshot at time zero and then at the first event boundary after every 10,000 events at which no method is suspended: no call is live, so every pending event, in-flight message and waiting call is plain data. A snapshot copies every node's state, servers and their waiting calls (as the message and method that start them), the event queue, every PRNG position and the counts of spans, metrics, logs and changes. Seeking to an event restores the latest snapshot at or before it into a fresh run of the same inputs, and replays to the event. A pause records its event, and is a snapshot too when the run is quiet then.
2. **Journaled re-drive of suspended calls.** Snapshots at any event. Each live call keeps a journal of everything ctx gave it, and every state read. Restoring re-runs each suspended method from its start against its journal, without effects, until it reaches the await it was suspended at, and then lets it continue live.
3. **Replay from zero.** No snapshots. Every seek re-runs the run from time zero to the event.

## Decision outcome

Chosen option: 1, decided by the human on 2026-10-01. It is exact, needs no change to behaviour code or `ctx`, and costs little. Runs in R0 send one request or a short sequence (spec §11 "Sources and load"), so they go quiet between requests, and a step back replays at most a little more than 10,000 events. Under sustained load (R1, task 0802) a run may rarely go quiet, and then a seek replays from further back. That task can revisit this with option 2, if its benchmarks need it.

## Consequences

- Good: seeks and steps are exact for any behaviour code, because they replay the run's own events.
- Good: a snapshot is plain data, so a branch run can share its parent's snapshots (eng §13), and the 0414 worker can keep them without live references.
- Bad: the 10,000-event spacing becomes "at the first quiet moment after each 10,000 events", and a pause in the middle of a call is only marked, not captured. Spec §13 and eng §13 change to say so.
- Bad: a run that never goes quiet seeks from time zero, so its seeks slow down as it grows.
- Follow-up tasks: 0413 implements option 1, with the step units of spec §12 and the memory cap. 0414 and 0415 build pause, resume and branches on it. 0802 measures seeks under load, and revisits this if they are too slow.

## Pros and cons of the options

### Option 1: quiet snapshots, replayed forward

- Good, because it is exact by construction, and simple to reason about.
- Good, because snapshots are plain data, cheap to take, to thin and to share.
- Bad, because how far a seek replays depends on how often the run goes quiet.

### Option 2: journaled re-drive

- Good, because snapshots can be taken anywhere, so seeks stay fast under any load.
- Bad, because every ctx call and every state read must be journaled, which costs throughput on every event, and a method that reads anything outside ctx breaks it.
- Bad, because re-driving a method without its effects needs a second mode of `ctx` and the state view, which doubles the surface the kernel must keep exact.

### Option 3: replay from zero

- Good, because it needs nothing but determinism, which the run already has.
- Bad, because every step back costs the whole run so far, so a long run misses the 100 ms target.
