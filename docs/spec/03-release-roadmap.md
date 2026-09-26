# 3. Release roadmap

Strata ships in six releases: R0–R2 are fully offline and single-user, R3 adds git-based teamwork, R4 adds real-time collaboration, and R5 is multi-tenant SaaS. Simulation is part of the first release, because it is the core of the product. Each release is usable on its own and never breaks files from an earlier one.

| Release | Theme | Scope | Exit criteria |
| --- | --- | --- | --- |
| R0 | Foundations and simulation core (offline) | Headless core and command bus; console API; `strata-graph` canvas; graph model and views; component model (properties, state, public and private methods, metrics); uniform recursion (open as system, drill-down, extract, inline, roll-up); plugin API, `strata pack` CLI and `strata serve`; starter library; simulation kernel in a Web Worker with single-request and short-sequence runs, scopes and stubs; full run control bar with snapshots, stepping back and scrubbing; breakpoints; state, method and message inspection; editing a paused run and branch runs; IndexedDB storage and `.strata` file; annotations and local-identity comments; PNG/SVG export | A user draws a three-level system offline, sends a request through it, pauses mid-flight, steps back three hops, changes a queue's capacity, replays from that moment and compares the two runs |
| R1 | Load, chaos and tests | Scenarios and load profiles with many concurrent requests; fixtures for functional runs; chaos faults; metric overlays and bottleneck detection; black-box calibration from expanded runs; trace waterfall, logs and watches; tests and architecture rules; `strata run` and `strata test` in Node; saved patterns | A checkout flow runs at 500 req/s, a failing SLO test is debugged to its bottleneck and the same test passes in CI via the CLI |
| R2 | Document and plan | Docs workspace with all templates and live bindings; ADR lifecycle; tickets with backlog, board and timeline; ticket generation; traceability matrix; Jira CSV export; BYO-key AI drafts; conditional breakpoints; 3D stack view; draw.io import | A full doc set and backlog are generated from one model, and every ticket traces to a component and a requirement |
| R3 | Versioning and git teamwork | Git-friendly project folder; snapshots, visual diff and what-if branches; semantic 3-way merge; cross-project system references; cost model; Jira, Linear and GitHub Issues push; DOCX export | Two people edit the same project in branches and merge without hand-editing JSON |
| R4 | Real-time collaboration | Self-hostable sync server; accounts and workspaces; presence and follow mode; live co-editing of model, docs and tickets; multi-user comments with mentions, notifications and suggestions; review and approval; system-level permissions; offline edits that sync later | Five people co-edit one system live and a suggestion is accepted after review |
| R5 | Multi-tenant SaaS | Organisations, SSO, RBAC, audit logs; org and public component registry with signed bundles; server-side headless runs for CI; public REST API and webhooks; two-way Jira sync; Confluence export; billing | A paying organisation onboards with SSO and runs architecture tests from its CI pipeline |

## R0 build sequence

The production codebase starts with R0, built in seven milestones across sessions. The simulator is built and tested headlessly before any UI depends on it.

1. **M1 Core:** model store, command bus, undo/redo, events, graph invariants, recursion resolver, console facade, Node test harness.
2. **M2 strata-graph:** the D3 diagram library with shapes, ports, edges, zoom, selection, frames and export.
3. **M3 Component model and plugins:** manifest schema (properties, state, methods, metrics), behaviour API, in-house bundler, `strata pack`, `strata serve`, starter library.
4. **M4 Simulation core:** kernel, method dispatch, black-box and expanded modes, scopes and stubs, snapshots, stepping in every unit, branch runs, control protocol, all usable from the console.
5. **M5 Shell:** Web Components UI, library, inspector (properties, state, methods), depth column and breadcrumb, drill transitions, run control bar and scrubber.
6. **M6 Persistence:** IndexedDB, sessionStorage, `.strata` import/export, File System Access save.
7. **M7 Comments:** annotations, threaded comments, anchors, roll-up badges.

---
Part of the [Strata Product and Technical Specification](README.md).
