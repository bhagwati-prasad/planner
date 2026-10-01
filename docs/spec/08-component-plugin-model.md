# 8. Component plugin model

A component type is a folder with a manifest, an icon, optional behaviour code across any number of JS files, and optional docs, ticket templates and tests. `strata pack` turns the folder into one self-contained `.strata.js` script, which is what offline users add to `strata.html` and what the local server serves.

## Folder layout

```
components/
  message-queue/
    manifest.json       # identity, ports, properties, state, methods, metrics
    icon.svg
    index.js            # behaviour entry (optional)
    lib/retention.js    # any number of extra modules
    README.md
    templates/          # doc and ticket templates (optional)
    tests/              # component self-tests (optional)
```

## Manifest

```json
{
  "strataApi": "^1.0",
  "id": "acme.message-queue",
  "name": "Message Queue",
  "version": "2.0.0",
  "category": "Messaging",
  "icon": "icon.svg",
  "entry": "index.js",
  "extends": "base:queue",
  "ports": [
    { "name": "in", "direction": "in", "accepts": ["async-message"], "exposes": ["publish"] },
    { "name": "consumers", "direction": "both", "accepts": ["async-message"], "exposes": ["receive", "ack", "nack"] },
    { "name": "dlq", "direction": "out", "accepts": ["async-message"] }
  ],
  "properties": {
    "capacity": { "type": "integer", "unit": "messages", "default": 100000, "min": 1, "group": "Capacity", "rollup": "sum" },
    "retention": { "type": "duration", "default": "4d", "group": "Durability" },
    "deliveryDelay": { "type": "distribution", "unit": "ms", "default": { "kind": "lognormal", "median": 5, "p99": 40 } },
    "overflowPolicy": { "type": "enum", "values": ["reject", "drop-oldest", "block"], "default": "reject" }
  },
  "state": {
    "messages": { "type": "queue", "of": "message", "initial": [] },
    "inFlight": { "type": "map", "of": "message", "initial": {} },
    "deadLetters": { "type": "list", "of": "message", "initial": [] }
  },
  "methods": {
    "public": {
      "publish": { "input": "message", "output": "ack", "errors": ["QUEUE_FULL"], "latency": "deliveryDelay" },
      "receive": { "input": { "max": "integer" }, "output": "message[]" },
      "ack": { "input": { "id": "string" }, "output": "ok" },
      "nack": { "input": { "id": "string" }, "output": "ok" }
    },
    "private": {
      "expire": {},
      "redeliver": { "latency": { "kind": "constant", "value": 1 } }
    }
  },
  "metrics": {
    "depth": { "unit": "messages", "rollup": "sum" },
    "oldestAge": { "unit": "s", "rollup": "max" }
  },
  "templates": { "docs": ["templates/runbook.md"], "tickets": ["templates/tickets.json"] },
  "migrations": { "1.x": "migrations/v1-to-v2.js" }
}
```

- Property types: `number`, `integer`, `boolean`, `string`, `enum`, `duration`, `bytes`, `rate`, `percent`, `distribution`, `list`, `map` and `ref` (to another component). Units are always explicit.
- A `distribution` accepts constant, uniform, normal, exponential, lognormal (median + p99) or an empirical histogram.
- State types add `queue`, `map`, `list` and `table`. Every state field has an initial value.
- A method's `latency` is a distribution, or the name of a property that holds one.
- An optional `servers` field gives the servers its public calls queue for (ADR 0020): `count` multiplies its entries, `backlog` bounds the calls waiting and `timeout` how long, in ms, each may wait. Each entry is a property, a state field as `state.<name>`, or a number, as in `{ "count": ["state.liveInstances", "concurrency"], "backlog": "maxBacklog" }`. A base type may give them instead; `base:service` takes `instances × concurrency`.
- Roll-up rules are those in §7, plus plain `min` and `max`.

## Behaviour API

Behaviour code runs only inside the simulation worker, never on the page. A public method's return value is its response.

```js
// index.js
import { isExpired } from './lib/retention.js'

export default {
  public: {
    publish(msg, ctx) {
      if (ctx.state.messages.length >= ctx.props.capacity) return ctx.fail('QUEUE_FULL')
      ctx.state.messages.push({ ...msg.body, enqueuedAt: ctx.now })
      ctx.metric('depth', ctx.state.messages.length)
      return { ok: true }
    },
    receive(msg, ctx) {
      ctx.call('expire')
      const batch = ctx.state.messages.splice(0, msg.body.max)
      for (const m of batch) ctx.state.inFlight[m.id] = m
      return batch
    },
    ack(msg, ctx) { delete ctx.state.inFlight[msg.body.id]; return { ok: true } },
    nack(msg, ctx) { return ctx.call('redeliver', msg.body.id) },
  },
  private: {
    expire(_, ctx) {
      ctx.state.messages = ctx.state.messages.filter(m => !isExpired(m, ctx.props.retention, ctx.now))
    },
    redeliver(id, ctx) {
      ctx.state.messages.unshift(ctx.state.inFlight[id])
      delete ctx.state.inFlight[id]
      return { ok: true }
    },
  },
  onFault(fault, ctx) { /* e.g. node-down drops non-durable messages */ },
}
```

A public method can call other components and wait for their answers in simulated time:

```js
async placeOrder(msg, ctx) {
  await ctx.call('reserveStock', msg.body.items)                              // private method
  const saved = await ctx.send('db', 'insert', { table: 'orders', row: msg.body })  // public method across an edge
  ctx.emit('events', 'publish', { type: 'OrderPlaced', id: saved.id })        // fire and forget
  return { status: 201, id: saved.id }
}
```

| Context member | Purpose |
| --- | --- |
| `ctx.props` | Effective property values, including run-only changes |
| `ctx.state` | This instance's typed state; every change is recorded for the debugger |
| `ctx.now`, `ctx.random()`, `ctx.sample(dist)` | Simulated clock and seeded randomness |
| `ctx.call(name, args)` | Call a private method; appears as a child span |
| `ctx.send(port, method, args, options?)` | Call a public method on the component across a port's edge; resolves when the response arrives in simulated time. `options` sets the message's `path`, `headers` and `sizeBytes`, which the receiver reads on `msg` and route rules match (ADR 0019) |
| `ctx.emit(port, method, args, options?)` | Send without waiting for a response |
| `ctx.fail(code, details)` | Return an error response |
| `ctx.schedule(delay, name, data)` | Timers that call `onTimer` |
| `await ctx.spend(dist)` | Wait that many ms, or a draw from a distribution, in simulated time, keeping the call's server (ADR 0021) |
| `ctx.metric(name, value)`, `ctx.log(level, ...args)` | Metrics and per-component logs |

Rules for behaviour code:

- Hooks are `public`, `private`, `init` (runs after initial state loads), `onTimer` and `onFault`.
- Methods may be `async`, but may await only promises returned by `ctx`. The kernel resolves them in event order, which keeps runs deterministic.
- Built-in base behaviours implement state, public methods and cost models for common kinds without code: `base:client`, `base:service`, `base:queue`, `base:topic`, `base:store`, `base:cache`, `base:proxy`, `base:timer`, `base:external` and `base:system`. A manifest with `extends` and no `entry` is fully declarative; with an `entry`, its methods override or add to the base.

## Packed bundle

```js
// message-queue.strata.js (generated by strata pack; do not edit)
Strata.registerComponent({
  manifest: { /* manifest.json */ },
  icon: '<svg>...</svg>',
  modules: {                                 // every JS file, as source text
    'index.js': '/* wrapped module source */',
    'lib/retention.js': '/* wrapped module source */'
  },
  entry: 'index.js',
  assets: { 'README.md': '...', 'templates/runbook.md': '...' },
  integrity: 'sha256-...'
})
```

Modules travel as source text, so the page only registers metadata and the worker evaluates the code through a Blob URL. This also solves the `file://` rule that blocks reading `manifest.json` and `icon.svg` directly.

## Loading paths

| Path | How it works |
| --- | --- |
| Offline | Run `strata pack components/message-queue`, then add its script tag between the markers in `strata.html`. `--install strata.html` inserts the tag for you |
| Local server | `strata serve` scans `components/*/manifest.json`, packs on the fly, watches for changes and serves `/api/components` |
| Upload | Drop a zip or `.strata.js` in the library panel. The in-browser packer (same code as the CLI) builds it; stored in IndexedDB offline or written to `components/` when served |
| Node | The CLI scans the folder with the same packer |

```html
<!-- STRATA:COMPONENTS:BEGIN - one line per packed component -->
<script src="components/message-queue/message-queue.strata.js"></script>
<!-- STRATA:COMPONENTS:END -->
```

CLI commands: `strata new component <name> [--extends base:queue]`, `strata pack <dir> [--watch] [--install <html>]`, `strata pack --all`, `strata validate <dir>` and `strata test-component <dir>`. The CLI needs Node 20+ and has zero npm dependencies.

## Sandbox

- **One worker per run** hosts the simulation kernel and all behaviours, which keeps it fast and deterministic.
- **Stripped globals:** before loading bundles the worker removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `caches` and, after bootstrap, `importScripts`.
- **Determinism:** `Math.random` becomes a seeded PRNG and `Date.now` and `performance.now` return simulated time.
- **Watchdog:** the kernel posts a heartbeat every 250 ms of wall time. After 2 s of silence the page terminates the worker and names the method that hung. Workers cannot be pre-empted mid-function, so termination is the only hard stop.
- **Private stays private:** the kernel routes edge traffic only to public methods exposed on the receiving port.
- **Quarantine (R2):** an untrusted component can run in its own worker behind a message proxy, trading speed for isolation.

## Versioning and other plugin kinds

Projects pin `id@version`, and several versions can coexist. A missing component renders as a placeholder that keeps its properties and state. Updates show a diff of properties, state fields and methods, and run the manifest's migrations; state schema changes need migrations just like property changes.

Connection types (HTTP, gRPC, WebSocket, async message, DB protocol, file/batch) use the same folder format under `connection-types/`. Later releases add doc templates, ticket templates, architecture rules, exporters, themes and AI actions as plugin kinds.

---
Part of the [Strata Product and Technical Specification](README.md).
