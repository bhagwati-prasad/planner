// Shared fixtures for strata-ui tests: a facade with deterministic ids and a few components.
import { createStrata } from '../../facade/src/index.js'

export const COMPONENTS = [
  {
    id: 'starter.service',
    name: 'Service',
    version: '1.0.0',
    extends: 'base:service',
    ports: [
      { name: 'in', direction: 'in', accepts: ['http'] },
      { name: 'out', direction: 'out', accepts: ['http'] },
      { name: 'db', direction: 'out', accepts: ['db-protocol'], side: 'bottom' },
    ],
  },
  {
    id: 'starter.relational-db',
    name: 'Relational DB',
    version: '1.0.0',
    extends: 'base:store',
    ports: [{ name: 'in', direction: 'in', accepts: ['db-protocol'], side: 'top' }],
  },
  {
    id: 'starter.gateway',
    name: 'API gateway',
    version: '1.0.0',
    extends: 'base:proxy',
    ports: [
      { name: 'in', direction: 'in', accepts: ['http'] },
      { name: 'out', direction: 'out', accepts: ['http'] },
    ],
  },
  { id: 'starter.queue', name: 'Message queue', version: '1.0.0', extends: 'base:queue' },
]

/** A facade with deterministic time and ids and the fixture components registered. */
export function createFixtureStrata() {
  let seed = 7
  const random = n =>
    Uint8Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) % 2147483648) & 0xff)
  let now = Date.UTC(2026, 8, 26, 10)
  const strata = createStrata({
    clock: () => now++,
    random,
    identity: { id: 'u1', name: 'Tester' },
    output: () => {},
  })
  for (const m of COMPONENTS) strata.components.register(m)
  return strata
}

/** A project with client → gateway → service → db, the service and db extracted into "Orders". */
export async function ordersProject() {
  const strata = createFixtureStrata()
  const p = await strata.projects.create('Shop')
  const root = p.root
  const client = root.add('base:client', { name: 'Web', at: { x: 0, y: 100 } })
  const gw = root.add('starter.gateway', { name: 'Gateway', at: { x: 220, y: 100 } })
  const svc = root.add('starter.service', { name: 'Orders API', at: { x: 440, y: 100 } })
  const db = root.add('starter.relational-db', { name: 'Orders DB', at: { x: 440, y: 260 } })
  root.connect(client, gw)
  root.connect(gw, svc)
  root.connect(svc, db)
  const orders = root.extract([svc, db], { name: 'Orders' })
  return { strata, p, root, client, gw, svc, db, orders }
}
