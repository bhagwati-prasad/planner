# 11. Content and voice

Strata speaks like a precise, helpful colleague: plain verbs, sentence case, no filler, no apologies.

- Buttons say exactly what happens: "Run scenario", "Extract as system", "Resolve thread". The result uses the same verb: "Scenario run finished", "Extracted Payments system".
- Errors state what happened, why, and how to fix it, with a direct action where possible: "Can't place Payments system here. It already contains this system, so placing it would create a loop. Place a copy instead." with the button "Place a copy".
- Empty states invite action and explain the benefit in one sentence.
- Numbers always carry units, and estimates are marked with "≈".

## Terminology

| Say | Meaning | Don't say |
| --- | --- | --- |
| System | An architecture that can contain components and other systems | Diagram, model, project (for this) |
| Component | Anything placed in a system; it can contain its own inner system | Node (developer term only), widget, box |
| Library component | A component type in the library | Plugin (except for developers) |
| Boundary port | A system's entry or exit point, seen from outside | Interface, pin |
| Connection | A link between two ports | Edge (developer term only), arrow, line |
| Enter, go up | Moving between levels | Zoom into, open |
| Extract as system, inline system | Roll-up and its inverse | Group, collapse, merge |
| Derived value | A value rolled up from inside a system | Computed, aggregate |
| Inner system | The architecture inside a component | Child diagram |
| State | Data a component holds while running | Memory |
| Public method | An operation other components can call over a connection | Endpoint (except for HTTP), API |
| Private method | An operation only the component itself can call | Helper, internal function |
| Black box, expanded | Running a component by its own model, or by its inner system | Collapsed, detailed |
| Scope | The part of the architecture a run covers | Subset, region |
| Stub | A stand-in that answers calls leaving the scope | Mock (fine for developers) |
| Branch | A run replayed from a moment of another run, with changes | Fork, copy |
| Scenario, run, trace | Sample traffic, one execution of it, one request's path | Test (unless it is one), job |
| Note, callout | Visible annotations | Sticky, comment |
| Comment, thread | Discussion | Note, annotation |

## Formatting numbers and units

All formatting goes through one formatter so these rules hold everywhere.

| Quantity | Examples |
| --- | --- |
| Latency | 0.42 ms, 4.2 ms, 184 ms, 1.24 s |
| Rates | 850 req/s, 1.2k req/s, 3.4M msg/s |
| Percentages | 82%, 4.6%, 0.08% |
| Sizes (decimal, 1 KB = 1,000 B) | 512 KB, 1.5 MB, 2.3 GB |
| Bandwidth | 100 Mbps, 10 Gbps |
| Durations | 45 s, 2 h 30 min, 4 d |
| Money | ≈ $1,240.00 per month, in the locale's currency format |
| Counts | 12,408 |
| Simulated time | t = 31.204 s |

- A space separates a number from its unit, except for %.
- Overlays show at most three significant digits; the inspector tooltip shows full precision.
- Relative times ("3 min ago") always show the absolute time on hover.

---
Part of the [Strata UI/UX Design System](README.md).
