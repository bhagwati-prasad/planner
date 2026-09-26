# Strata

Strata (working name) is a browser-first tool to design, simulate, debug, test, document and plan software architectures, where every shape on the canvas is an executable component. It ships first as an offline HTML app and grows over six releases into a multi-tenant, real-time collaborative SaaS.

The product and technical specification lives in the Claude Docs document **"Strata — Architecture & Spec Planner: Product and Technical Specification"**. This repository is the production codebase it describes.

## Status

R0 (offline foundations) is built in six milestones. This repository currently holds **M1: Core**.

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 Core | Model store, command bus, undo/redo, events, recursion resolver, console facade, Node test harness | Done |
| M2 strata-graph | D3 diagram library: shapes, ports, edges, zoom, selection, frames, export | Next |
| M3 Shell | Web Components UI, library panel, inspector, breadcrumb, drill-down transitions | |
| M4 Plugins | Manifest schema, in-house bundler, `strata pack`, `strata serve`, starter library | |
| M5 Persistence | IndexedDB, sessionStorage, `.strata` import/export, File System Access save | |
| M6 Comments | Annotations, threaded comments, anchors, roll-up badges | |

See [docs/implementation-notes.md](docs/implementation-notes.md) for what M1 covers in detail and the decisions taken where the spec left room.

## Layout

```
packages/
  strata-core/   headless core: entity store, command bus, op log, undo/redo, events,
                 queries, validation, recursion resolver, roll-up engine
  strata/        the facade: the one public API (browser console, Node, and the UI to come)
examples/        runnable scripts
scripts/         test runner and architecture boundary check
docs/            implementation notes
```

Dependencies point downward only: `strata` → `strata-core`. `npm run check` enforces this and keeps both packages free of DOM, Node built-ins and npm dependencies, so they run unchanged in a browser tab, a Web Worker and Node.

## Try it

Node 20 or newer; there is nothing to install.

```sh
npm test          # all tests (node:test)
npm run check     # architecture boundary check
npm run verify    # both
npm run demo      # the console session from the spec, headless
```

```js
import { createStrata } from './packages/strata/src/index.js'

const strata = createStrata()
const p = await strata.projects.create('checkout')
const root = p.root

const gw = root.add('base:proxy', { name: 'Edge GW' })
const svc = root.add('base:service', { name: 'Orders' })
const db = root.add('base:store', { name: 'Orders DB' })
root.connect(gw, svc)
root.connect(svc, db)

const orders = root.extract([svc, db], { name: 'Orders System' }) // roll-up
orders.enter()                                                     // drill-down
strata.print(root)
strata.undo()
strata.help()
```

## Principles (from the spec)

- **One model, many projections.** Canvas, 3D view, docs, tickets and tests all read the same model.
- **Headless first.** Every UI action is a serialisable command that the console, the CLI or a replacement UI can issue.
- **Recursive by construction.** A system is a component and a component may contain a system, to any depth.
- **Plugins are first-class.** Built-in components use the same plugin API as user components.
- **Offline-complete.** Every R0 feature works from `file://` with no network, no server and no build step.
- **Collaboration-ready data from day one.** ULIDs, author ids, timestamps and an operation log exist in R0.
- **No framework.** HTML templates, Web Components, vanilla JavaScript, D3.js and Three.js only.
