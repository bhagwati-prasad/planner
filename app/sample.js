// Sample content for the development app. The components are stand-ins until the starter
// library arrives with the plugin system (M4); the project shows recursion and references.

export const SAMPLE_COMPONENTS = [
  {
    id: 'sample.api-gateway',
    name: 'API gateway',
    version: '0.1.0',
    category: 'Edge',
    extends: 'base:proxy',
    ports: [{ name: 'in', direction: 'in', accepts: ['http'] }, { name: 'out', direction: 'out', accepts: ['http', 'grpc'] }],
    properties: {
      rateLimit: { type: 'number', unit: 'req/s', default: 500, min: 0, group: 'Traffic' },
      authMode: { type: 'enum', values: ['none', 'jwt', 'api-key', 'mtls'], default: 'jwt', group: 'Security' },
      latency: { type: 'distribution', unit: 'ms', default: { kind: 'lognormal', median: 1, p99: 5 }, group: 'Performance' }
    }
  },
  {
    id: 'sample.service',
    name: 'Service',
    version: '0.1.0',
    category: 'Compute',
    extends: 'base:service',
    ports: [
      { name: 'in', direction: 'in', accepts: ['http', 'grpc'] },
      { name: 'out', direction: 'out', accepts: ['http', 'grpc'] },
      { name: 'db', direction: 'out', accepts: ['db-protocol'], side: 'bottom' },
      { name: 'events', direction: 'out', accepts: ['async-message'], side: 'bottom' }
    ],
    properties: {
      concurrency: { type: 'integer', default: 50, min: 1, group: 'Capacity' },
      timeout: { type: 'duration', default: '2s', group: 'Resilience' },
      retries: { type: 'integer', default: 2, min: 0, group: 'Resilience' },
      latency: { type: 'distribution', unit: 'ms', default: { kind: 'lognormal', median: 20, p99: 80 }, group: 'Performance' }
    }
  },
  {
    id: 'sample.relational-db',
    name: 'Relational DB',
    version: '0.1.0',
    category: 'Data',
    extends: 'base:store',
    ports: [{ name: 'in', direction: 'in', accepts: ['db-protocol'], side: 'top' }],
    properties: {
      maxConnections: { type: 'integer', default: 100, min: 1, group: 'Capacity' },
      storage: { type: 'bytes', default: '100GB', group: 'Capacity' },
      readReplicas: { type: 'integer', default: 0, min: 0, group: 'Capacity' },
      latency: { type: 'distribution', unit: 'ms', default: { kind: 'lognormal', median: 2, p99: 15 }, group: 'Performance' }
    }
  },
  {
    id: 'sample.message-queue',
    name: 'Message queue',
    version: '0.1.0',
    category: 'Messaging',
    extends: 'base:queue',
    properties: {
      capacity: { type: 'integer', unit: 'messages', default: 100000, min: 1, group: 'Capacity', rollup: 'sum' },
      retention: { type: 'duration', default: '4d', group: 'Durability' },
      overflowPolicy: { type: 'enum', values: ['reject', 'drop-oldest', 'block'], default: 'reject', group: 'Durability' }
    }
  },
  {
    id: 'sample.cache',
    name: 'Cache',
    version: '0.1.0',
    category: 'Data',
    extends: 'base:cache',
    properties: {
      capacity: { type: 'bytes', default: '1GB', group: 'Capacity' },
      eviction: { type: 'enum', values: ['LRU', 'LFU', 'TTL', 'random'], default: 'LRU', group: 'Behaviour' },
      ttl: { type: 'duration', default: '5m', group: 'Behaviour' }
    }
  }
]

/**
 * Checkout: a web client and gateway in front of an Orders system (placed by value, with its
 * own service, database and queue) and a shared Auth system placed by reference.
 * @param {import('../packages/strata/src/index.js').Strata} strata
 */
export async function buildSampleProject (strata) {
  const p = await strata.projects.create('Checkout')
  const root = p.root
  const web = root.add('base:client', { name: 'Web shop', at: { x: 40, y: 200 } })
  const gw = root.add('sample.api-gateway', { name: 'Edge gateway', props: { rateLimit: 1000 }, at: { x: 280, y: 200 } })
  const orders = root.add('sample.service', { name: 'Orders API', at: { x: 540, y: 120 } })
  const db = root.add('sample.relational-db', { name: 'Orders DB', at: { x: 540, y: 320 } })
  const queue = root.add('sample.message-queue', { name: 'Order events', at: { x: 800, y: 320 } })
  const bank = root.add('base:external', { name: 'Payment provider', at: { x: 1060, y: 120 } })
  root.connect(web, gw, { type: 'http', label: 'HTTPS' })
  root.connect(gw, orders, { type: 'http' })
  root.connect(orders.port('db'), db.port('in'))
  root.connect(orders.port('events'), queue.port('in'))
  root.connect(orders.port('out'), bank.port('in'), { type: 'http' })
  const system = root.extract([orders, db, queue], { name: 'Orders' })
  system.set({ contract: { 'latency.p99': { max: 150, unit: 'ms' } } })

  const auth = p.createSystem('Auth', { levelTag: 'container', description: 'Shared identity service used by every product team.' })
  const idp = auth.add('sample.service', { name: 'Identity API', at: { x: 80, y: 80 } })
  const users = auth.add('sample.relational-db', { name: 'Users DB', at: { x: 80, y: 260 } })
  const tokens = auth.add('sample.cache', { name: 'Token cache', at: { x: 340, y: 80 } })
  auth.connect(idp.port('db'), users.port('in'))
  auth.connect(idp.port('out'), tokens.port('in'), { type: 'http' })
  auth.expose(idp.port('in'), { name: 'in' })
  const authNode = root.place(auth, { at: { x: 280, y: 420 } })
  root.connect(gw.port('out'), authNode.port('in'), { type: 'http', label: 'verify' })

  // Start the playground with a clean history, so Undo does not take the sample apart.
  p.clearHistory()
  return p
}
