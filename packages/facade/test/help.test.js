import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CORE } from '../src/internal.js'
import { createTestStrata } from './fixtures.js'
import {
  buildRecursivePayments,
  FIXTURE_MANIFESTS,
} from '../../../tools/fixtures/recursive-payments.js'

/** How help names the object each class's methods are called on. */
const PREFIX = {
  Strata: 'strata',
  ProjectsApi: 'strata.projects',
  ComponentsApi: 'strata.components',
  SimApi: 'strata.sim',
  Navigator: 'strata.nav',
  ProjectHandle: 'p',
  SystemHandle: 'sys',
  NodeHandle: 'node',
  PortHandle: 'port',
  EdgeHandle: 'edge',
  BoundaryPortHandle: 'bp',
  Handle: 'handle',
  Collection: 'collection',
}

/**
 * The methods a console user can call on an object, each with the class that defines it: its
 * own class's, then its base classes' up to Object or Array. Names starting with _ are internal,
 * as the facade-help lint rule has it.
 * @param {object} obj
 */
function methodsOf(obj) {
  /** @type {Map<string, string>} */
  const found = new Map()
  for (
    let proto = Object.getPrototypeOf(obj);
    proto && proto !== Object.prototype && proto !== Array.prototype;
    proto = Object.getPrototypeOf(proto)
  )
    for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(proto)))
      if (
        name !== 'constructor' &&
        !name.startsWith('_') &&
        typeof d.value === 'function' &&
        !found.has(name)
      )
        found.set(name, proto.constructor.name)
  return found
}

/** @param {string} text */
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A facade holding the recursive payments fixture (tools/fixtures), built through commands. */
async function recursiveStrata() {
  const t = createTestStrata()
  for (const m of FIXTURE_MANIFESTS) t.strata.components.register(m)
  const p = await t.strata.projects.create('Checkout')
  const ids = buildRecursivePayments({
    rootSystemId: p.root.id,
    dispatch: command => p.dispatch(command),
    portsOf: nodeId => p[CORE].portsOf(nodeId),
  })
  return { ...t, p, ids }
}

describe('help metadata', () => {
  it('every facade method has help metadata', async () => {
    const { strata, p, ids } = await recursiveStrata()
    const topics = [...strata.helpText().matchAll(/strata\.help\('(\w+)'\)/g)].map(m => m[1])
    const text = topics.map(topic => strata.helpText(topic)).join('\n')
    const payments = p.node(ids.payments)
    const service = p.node(ids.service)
    const objects = [
      strata,
      strata.projects,
      strata.components,
      strata.sim,
      strata.nav,
      p,
      p.root,
      service,
      service.port('ledger'),
      service.port('ledger').edges()[0],
      payments.child?.port('in'),
      p.root.nodes(),
    ]
    const missing = []
    for (const obj of objects)
      for (const [name, owner] of methodsOf(obj)) {
        assert.ok(owner in PREFIX, `help names the objects of class ${owner}`)
        const signature = `  ${PREFIX[owner]}.${name}(`
        // A signature line, a one-line description, and an example.
        const entry = new RegExp(`^${escape(signature)}.*\\)\\n {6}\\S.*\\n {6}e\\.g\\. \\S`, 'm')
        if (!entry.test(text)) missing.push(signature.trim())
      }
    assert.deepEqual([...new Set(missing)], [])
  })

  it('strata.print() renders the recursive fixture as a stable text tree (snapshot)', async () => {
    const { strata, printed } = await recursiveStrata()
    strata.print()
    assert.equal(
      printed.join('\n'),
      `Checkout  [context] · 3 nodes
├─ Web client  base:client@1.0.0
│    out → Payments.in  (http)
├─ Bank API  base:external@1.0.0
└─ ▣ Payments  (by value · 6 nodes)
     in binds authorise → Payment service.authorise, refund → Ledger.reverse
     out → Bank API.in  (async-message)
   ├─ Gateway  fixture.gateway@1.0.0
   │    out → Payment service.in  (http)
   ├─ Payment service  fixture.payment-service@1.0.0
   │    ledger → Ledger.in  (http)  calls record
   │    fraud → Fraud check.in  (http)  calls score
   │    auth → Auth.in  (http)  calls verify
   │    publish → Settlement queue.in  (async-message)
   ├─ Settlement queue  base:queue@1.0.0
   ├─ ▣ Fraud check  fixture.fraud@1.0.0  (opened as a system · 2 nodes)
   │    in binds score → Rules engine.score
   │  ├─ Rules engine  fixture.rules-engine@1.0.0
   │  │    model → Model store.in  (db-protocol)
   │  └─ Model store  fixture.database@1.0.0
   ├─ ▣ Ledger  (by value · 2 nodes)
   │    in binds record → Ledger API.record, reverse → Ledger API.reverse
   │  ├─ Ledger API  fixture.ledger-api@1.0.0
   │  │    db → Ledger DB.in  (db-protocol)
   │  └─ Ledger DB  fixture.database@1.0.0
   └─ ▣ Auth  (by reference · read-only · 2 nodes)
        in binds verify → Token service.verify
      ├─ Token service  fixture.token-service@1.0.0
      │    store → Token store.in  (db-protocol)
      └─ Token store  fixture.database@1.0.0`
    )
    const again = await recursiveStrata()
    again.strata.print()
    assert.deepEqual(again.printed, printed, 'the same commands print the same tree')
  })
})
