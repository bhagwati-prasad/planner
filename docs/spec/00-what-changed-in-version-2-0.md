# What changed in version 2.0

- The architecture is formally a directed graph: every node is a component, and components connect only through edges (§5).
- Every component has properties, typed state, public and private methods, and metrics (§6).
- Recursion is uniform: any component can contain its own inner system, to any depth (§7).
- Simulation is the core feature. A working simulator with full run controls ships in R0 (§3, §11, §12).
- Runs can cover just part of the architecture, with stubs where the scope ends (§11).
- A paused run can be edited, then resumed, replayed from a chosen moment, or restarted (§12).
- The run control bar adds stop, restart, run to end, stepping back or forward by any amount, and a scrubber (§12).
- Section numbers changed: two sections were added, so later sections moved down.

---
Part of the [Strata Product and Technical Specification](README.md).
