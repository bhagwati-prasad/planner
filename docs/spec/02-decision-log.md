# 2. Decision log

Decisions came from three rounds: the original questionnaire, three hard requirements added next, and seven clarifications about the graph model and simulation. Everything else uses the proposed defaults. The eight open questions from version 1 are resolved in §21.

| Q | Topic | Decision | Source |
| --- | --- | --- | --- |
| A1 | Deliverable | Staged spec from offline app to collaborative SaaS; then a production codebase built over several sessions | You |
| A2 | Users | Solo architects and small teams first; enterprises from R5 | Default |
| A3 | Build order | Canvas → component model and plugins → simulation and run controls → debugger → tests → docs → tickets | Default, revised by you |
| A4 | Inspiration | Draw from all reference apps, but cohesively | You |
| B5 | Form factor | Static web app plus a tiny optional local server; SaaS later | You |
| B6 | Discovery | Local server scans `components/` at runtime and watches for changes | Default |
| B7 | Storage | Single-file export; working copy kept in browser storage until the user deletes it (§19) | You |
| B8 | Collaboration | Later stage: git-based in R3, real-time in R4 | You |
| B9 | Stack | HTML templates, Web Components, vanilla JS, D3.js, Three.js; an in-house D3 diagram library | You |
| C10 | Canvas | All draw.io essentials, including layers | Default |
| C11 | Model | Model separate from views; mandatory because of recursion | Default |
| C12 | Notation | Generic shapes plus C4 level tags; vendor icon packs as plugins | Default |
| C13 | Connections | Typed, with properties, and pluggable | Default |
| C14 | Import/export | PNG, SVG, JSON in R0; draw.io XML import in R2 | Default |
| D15–16 | Component format | Folder with manifest, icon, entry and extra modules; declarative with optional JS | Default |
| D17 | Offline packing | Tiny CLI packs multi-file modules into one script | You |
| D18 | Uploads | Zip or packed file; written to disk when served, IndexedDB when offline | Default |
| D19 | Sandbox | Web Worker | You |
| D20 | Versioning | Semver, pinned per project, placeholders for missing components | Default |
| D21 | Starter library | Every component models full properties, state, methods and runtime metrics | You |
| D22 | Patterns | R1: a pattern is simply a saved system | Default |
| E24–30 | Simulation | Discrete-event performance plus functional; no live integration | Default |
| F31–32 | Debugger | Full set; stepping backward and time travel in R0; conditional breakpoints in R2 | Default, revised |
| G33–35 | Testing | Functional, method, SLO, resilience and static rules; UI and code; CLI runner in R1 | Default |
| H36–43 | Docs | Auto-populated templates, optional BYO-key AI, MADR ADRs, block editor over Markdown | Default |
| I44–48 | Tickets | Epic → Story → Sub-task plus Spike and Bug; generated from the model; Jira CSV first | Default |
| J49–52 | Cross-cutting | Traceability, snapshots and diff, no codegen in v1, 500+ node diagrams | Default |
| New 1 | Recursion | Any component can contain an inner system; drill-down and roll-up at any depth | You |
| New 2 | Comments | Annotations and threaded comments on anything, designed for multi-user use | You |
| New 3 | Headless | Fully usable from console and Node; UI replaceable with little effort | You |
| New 4 | Graph model | A directed graph; every node is a component; components connect only through edges between ports | You |
| New 5 | Component interface | Every component has properties, typed state, public and private methods, and metrics | You |
| New 6 | Simulation priority | Simulation is the core feature; a working simulator ships in R0 | You |
| New 7 | Simulation scope | A run can cover the whole project, one system, a selection or a request path, with stubs at the boundary | You |
| New 8 | Editing a paused run | Edit properties, state, code or structure while paused; then resume, replay from a moment, or restart | You |
| New 9 | Run controls | Play, pause, stop, restart, run to end, step back or forward by n, speed and a scrubber | You |

---
Part of the [Strata Product and Technical Specification](README.md).
