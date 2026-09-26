# 1. Overview

Strata (working name) is a browser-first tool to design, simulate, debug, test, document and plan software architectures, where every shape on the canvas is an executable component. It ships first as an offline HTML app and grows over six releases into a multi-tenant, real-time collaborative SaaS.

The core loop is Design → Simulate → Debug → Test → Document → Plan. One architecture model feeds every step, so nothing is typed twice.

## Design principles

- **Simulation at the centre.** Every architecture is runnable from the moment it is drawn. Simulation is the main way to understand, validate and debug a design, so a working simulator ships in the first release.
- **One model, many projections.** Canvas, 3D view, docs, tickets and tests all read the same model. A rename on the canvas updates every ADR, ticket and test that mentions it.
- **Headless first.** The core has no DOM dependency. Every UI action is a serialisable command that the browser console, the Node CLI or a replacement UI can issue.
- **Recursive by construction.** Every component can contain its own architecture, and the components inside can too, to any depth.
- **Plugins are first-class.** Built-in components use the same plugin API as user components; there is no private API.
- **Offline-complete.** Every R0 feature works from `file://` with no network, no server and no build step for the end user.
- **Collaboration-ready data from day one.** ULIDs, author ids, timestamps and an operation log exist in R0, even with one user.
- **No framework.** HTML templates, Web Components, vanilla JavaScript, D3.js and Three.js only.

## Inspirations, unified

| Source | What Strata borrows | Where it lands |
| --- | --- | --- |
| draw.io | Free-form canvas, shape library, style panel, pages, offline single-file ethos | Design surface (§10) |
| Structurizr | Model separate from views, C4 levels, architecture as code | Domain model (§5), console API (§18) |
| IcePanel | Zooming drill-down between levels, flows over diagrams, object linking | Recursion (§7), scenarios (§11) |
| Cloudcraft | Live properties, capacity and cost on components, isometric 3D | Property model (§9), 3D stack view (§10) |
| Eraser | Docs and diagrams side by side, AI drafting | Documentation (§15) |
| Excalidraw | Low-friction feel, sketch mode, keyboard-first | Canvas UX (§10) |
| Miro | Sticky notes, comment pins, presence, facilitation | Annotations and comments (§17), collaboration (§20) |

Cohesion rule: one visual token set, one selection model, one inspector, one comment system and one command palette across canvas, docs, tickets and tests.

---
Part of the [Strata Product and Technical Specification](README.md).
