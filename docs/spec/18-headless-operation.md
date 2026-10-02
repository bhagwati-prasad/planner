# 18. Headless operation

Everything Strata does is available without a UI: the same `strata` facade works in the browser console and in Node, and the shipped UI is just one client of it. Replacing the UI means writing new Web Components against the facade; the core does not change.

## Rules that make this possible

- The core never touches the DOM.
- Every mutation is a serialisable command `{ type, payload }` on the command bus. This one path gives undo, the op log, macros, sync and console scripting.
- Reads return plain objects; changes arrive as events through `strata.on(event, fn)`.
- The UI may not reach past the facade; a lint rule in the repo enforces this.

## Console API

```js
const p = await strata.projects.open('checkout')
const root = p.root

const gw  = root.add('api-gateway', { name: 'Edge GW', props: { rateLimit: 1000 } })
const svc = root.add('service', { name: 'Orders', props: { endpoints: [{ name: 'POST /orders', calls: ['out.insert'] }] } })
const db  = root.add('relational-db', { name: 'Orders DB' })
root.connect(gw.port('out'), svc.port('in'), { type: 'http' })
root.connect(svc.port('out'), db.port('in'), { type: 'db-protocol', method: 'insert' })

svc.methods()                      // public and private methods with signatures
svc.state()                        // typed initial state
const inner = svc.openAsSystem()   // give any component an inner system
inner.enter()                      // drill down; the UI follows if attached
const orders = root.extract([svc.id, db.id], { name: 'Orders System' })  // roll-up
orders.rollup('latency.p99')       // derived value

const run = await strata.sim.start({ scenario: 'checkout', scope: { selection: [svc.id, db.id] }, seed: 42 })
await run.stepForward(5, 'hop')
await run.stepBack(3, 'followedHop')
Object.keys(run.state(db).tables.orders).length
run.edit(db, { props: { maxConnections: 200 } })   // run-only change
const branch = await run.replayFromHere()
await branch.runToEnd()
strata.sim.compare(run, branch)

await strata.test.run({ tags: ['slo'] })
strata.comments.add(svc, 'Should this call be async?', { type: 'question' })
await strata.docs.render('ADR-003', { format: 'md' })

strata.$            // current UI selection
strata.print(root)  // text tree of the system for console or terminal
strata.help('sim')  // commands with signatures and examples
```

Every collection has `toTable()` for `console.table`. Run handles expose every control in §12, and `strata.debug.*` exposes the debugger protocol from §13. Each control is a message to the simulation worker, and its reply is a view of the moment it left the run at, so `run.state(node)`, `run.edit(…)` and `strata.sim.compare(a, b)` need no `await` ([ADR 0025](../adr/0025-run-sessions-in-the-worker-protocol.md)). Until scenarios arrive in R1, a run is given its requests instead: `strata.sim.start({ requests: [{ to: svc, path: '/orders', body }], scope, seed })`.

## Node CLI

| Command | Purpose |
| --- | --- |
| `strata new project <name>` | Scaffold a project |
| `strata serve [--port 4321] [--components ./components]` | Local server with component discovery |
| `strata pack`, `strata validate` | Component packaging (§8) |
| `strata run <project> --scenario checkout --scope system:payments --rate 200 --duration 30s --seed 42 --out run.json` | Headless simulation, optionally scoped |
| `strata test <project> [--tags slo] [--reporter junit\|json\|pretty]` | Tests for CI, non-zero exit on failure |
| `strata lint <project>` | Static architecture rules only |
| `strata docs <project> --format md\|html\|pdf --out ./docs` | Render the doc set |
| `strata tickets <project> --format jira-csv --out tickets.csv` | Export the backlog |
| `strata repl <project>` | Interactive session with the console API |
| `strata script <file.js> <project>` | Run automation scripts |

## Swappable UI

- **Shell config:** a JSON file maps layout regions to custom element names. Replacing `<strata-inspector>` with your own element is one line.
- **Design tokens:** all colours, spacing and type are CSS custom properties, so re-theming needs no code.
- **Renderers:** 2D (`strata-graph`), 3D (`strata-3d`) and text (`strata.print`) are interchangeable views of the same model.
- **Embedding:** `<strata-canvas project="...">` can be dropped into another web app.

## Adapter interfaces

| Adapter | Browser | Node | SaaS |
| --- | --- | --- | --- |
| Storage | IndexedDB + sessionStorage + localStorage | Filesystem | Remote API + IndexedDB cache |
| Sandbox host | Web Worker (Blob URL) | `worker_threads` | Isolated server workers |
| File I/O | File System Access API or download | `fs` | Object storage |
| Transport | None (R0–R3) | None | WebSocket sync (R4+) |
| AI provider | Anthropic, OpenAI, Ollama | Same | Org-managed keys |
| Notifications | In-app | stdout | In-app, email, webhooks |

---
Part of the [Strata Product and Technical Specification](README.md).
