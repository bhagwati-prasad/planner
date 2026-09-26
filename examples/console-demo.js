#!/usr/bin/env node
// The console session from spec §16, run headlessly in Node: `npm run demo`.
// The starter component library arrives in M4, so this registers three stand-ins first.
import { createStrata } from '../packages/strata/src/index.js'

const strata = createStrata()

strata.components.register({
  id: 'starter.api-gateway',
  name: 'API gateway',
  version: '1.0.0',
  extends: 'base:proxy',
  ports: [{ name: 'in', direction: 'in', accepts: ['http'] }, { name: 'out', direction: 'out', accepts: ['http', 'grpc'] }],
  properties: {
    rateLimit: { type: 'number', unit: 'req/s', default: 500 },
    latency: { type: 'distribution', unit: 'ms', default: { kind: 'lognormal', median: 1, p99: 5 } }
  }
})
strata.components.register({
  id: 'starter.service',
  name: 'Service',
  version: '1.0.0',
  extends: 'base:service',
  ports: [
    { name: 'in', direction: 'in', accepts: ['http', 'grpc'] },
    { name: 'out', direction: 'out', accepts: ['http', 'grpc'] },
    { name: 'db', direction: 'out', accepts: ['db-protocol'] }
  ],
  properties: { latency: { type: 'distribution', unit: 'ms', default: { kind: 'lognormal', median: 20, p99: 80 } } }
})
strata.components.register({
  id: 'starter.relational-db',
  name: 'Relational DB',
  version: '1.0.0',
  extends: 'base:store',
  ports: [{ name: 'in', direction: 'in', accepts: ['db-protocol'] }],
  properties: {
    latency: { type: 'distribution', unit: 'ms', default: { kind: 'lognormal', median: 2, p99: 15 } },
    maxConnections: { type: 'integer', default: 100 }
  }
})

const heading = text => console.log(`\n\x1b[1m${text}\x1b[0m`)

await strata.projects.create('checkout')
const p = await strata.projects.open('checkout')
const root = p.root

const gw = root.add('api-gateway', { name: 'Edge GW', props: { rateLimit: 1000 } })
const svc = root.add('service', { name: 'Orders' })
const db = root.add('relational-db', { name: 'Orders DB' })
root.connect(gw.port('out'), svc.port('in'), { type: 'http' })
root.connect(svc.port('db'), db.port('in'), { type: 'db-protocol' })

heading('Before extract')
strata.print(root)

const orders = root.extract([svc.id, db.id], { name: 'Orders System' }) // roll-up
orders.enter() // drill-down; the UI follows if attached

heading('After extract')
strata.print(root)
console.log(`\nbreadcrumb: ${strata.nav.breadcrumb}`)
console.log(`Orders System latency.p99 = ${orders.rollup('latency.p99')} ms (derived)`)
console.log(`checkout latency.p99      = ${root.rollup('latency.p99')} ms (derived)`)

heading('Nodes (console.table)')
console.table(root.nodes().toTable())

heading('Undo the extract')
strata.undo()
strata.print(root)
console.log(`breadcrumb: ${strata.nav.breadcrumb}`)

heading("strata.help('system')")
strata.help('system')

heading("strata.help('sim')")
strata.help('sim')
