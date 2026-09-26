# 0004 Deterministic discrete-event simulation

Status: Accepted
Date: 2026-09-26

## Context and problem

Simulation is the core feature. Stepping backward, replaying from a moment, branch runs, tests in CI and run comparison all need runs to be exactly reproducible, including across browsers.

## Decision outcome

A discrete-event kernel in a sandboxed worker, using integer microseconds, events ordered by (time, priority, sequence), seeded xoshiro128** streams per component, in-house deterministic `log` and `exp`, and `ctx` promises resolved only by kernel events. Snapshots plus deterministic replay implement stepping back and seeking.

## Consequences

- Good: identical run hashes in Node, Chromium, Firefox and WebKit; exact time travel.
- Bad: behaviour code must follow determinism rules; `strata validate` and the kernel enforce them.
- See spec §11 and §12, and engineering guidelines §13.
