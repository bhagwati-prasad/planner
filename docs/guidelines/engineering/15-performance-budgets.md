# 15. Performance budgets

Budgets are measured on the reference machine: a 2023 mid-range laptop with 8 cores and 16 GB of RAM, running current stable Chrome. CI fails when a measure regresses by more than 10% or crosses its budget.

| Measure | Budget |
| --- | --- |
| Core, facade and non-UI packages (minified) | 250 KB |
| strata-graph (minified) | 115 KB |
| strata-ui (minified) | 235 KB |
| Simulation worker bundle (minified) | 120 KB |
| Bundled fonts (woff2, Latin subset) | 120 KB |
| Console help metadata (minified) | 25 KB |
| Offline startup to interactive | 2 s |
| Canvas frame time at 500 visible nodes during pan and zoom | 16 ms |
| Command dispatch to UI update, p95, 2,000-node project | 50 ms |
| Simulation throughput | 200,000 events/s |
| One step back or forward | 100 ms |
| Scrub to any moment of a 60 s run | 300 ms |
| Snapshot overhead | 10% of simulation throughput |
| IndexedDB flush after a command | 500 ms |
| Idle heap, 2,000-node project | 300 MB |

D3 is excluded from the JS budgets and Three.js is lazy-loaded, matching spec §21. The console help metadata (`packages/facade/src/help-data.js`, generated from the facade's JSDoc) is text, not code, so it has its own line and does not count toward the core budget ([ADR 0013](../../adr/0013-console-help-metadata-has-its-own-budget.md)). strata-graph has 115 KB and strata-ui 235 KB, so core, strata-graph and strata-ui still sum to the 600 KB of spec §21 ([ADR 0014](../../adr/0014-strata-graph-budget-of-110-kb.md), [ADR 0016](../../adr/0016-strata-graph-budget-of-115-kb.md)).

---
Part of the [Strata Engineering Guidelines](README.md).
