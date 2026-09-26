// Shared helpers for strata-core tests: deterministic cores and small model builders.
import { createCore, createPrng, createRegistry } from '../src/index.js'

export const T0 = Date.UTC(2026, 8, 25, 9, 0, 0)

/** A controllable clock. */
export function testClock(start = T0) {
  let t = start
  const clock = () => t
  clock.advance = (ms = 1) => {
    t += ms
  }
  return clock
}

/** Component manifests used across tests. */
export const FIXTURE_MANIFESTS = [
  {
    strataApi: '^1.0',
    id: 'acme.message-queue',
    name: 'Message Queue',
    version: '1.2.0',
    category: 'Messaging',
    icon: 'icon.svg',
    entry: 'index.js',
    extends: 'base:queue',
    ports: [
      { name: 'in', direction: 'in', accepts: ['async-message'] },
      { name: 'out', direction: 'out', accepts: ['async-message'] },
      { name: 'dlq', direction: 'out', accepts: ['async-message'] },
    ],
    properties: {
      capacity: {
        type: 'integer',
        unit: 'messages',
        default: 100000,
        min: 1,
        group: 'Capacity',
        rollup: 'sum',
      },
      retention: { type: 'duration', default: '4d', group: 'Durability' },
      deliveryDelay: {
        type: 'distribution',
        unit: 'ms',
        default: { kind: 'lognormal', median: 5, p99: 40 },
        rollup: 'critical-path',
      },
      overflowPolicy: {
        type: 'enum',
        values: ['reject', 'drop-oldest', 'block'],
        default: 'reject',
      },
    },
    metrics: {
      depth: { unit: 'messages', rollup: 'sum' },
      oldestAge: { unit: 's', rollup: 'max' },
    },
  },
  {
    id: 'test.service',
    name: 'Test Service',
    version: '1.0.0',
    extends: 'base:service',
    ports: [
      { name: 'in', direction: 'in', accepts: ['http', 'grpc'] },
      { name: 'out', direction: 'out', accepts: ['http', 'grpc'] },
      { name: 'db', direction: 'out', accepts: ['db-protocol'] },
    ],
    properties: {
      serviceTime: { type: 'distribution', unit: 'ms', default: 10, rollup: 'critical-path' },
      maxRps: { type: 'number', unit: 'req/s', default: 1000, rollup: 'min-path' },
      timeout: { type: 'duration', default: '2s' },
    },
  },
  {
    id: 'test.db',
    name: 'Test DB',
    version: '1.0.0',
    extends: 'base:store',
    ports: [{ name: 'in', direction: 'in', accepts: ['db-protocol'] }],
    properties: {
      serviceTime: { type: 'distribution', unit: 'ms', default: 5, rollup: 'critical-path' },
      maxRps: { type: 'number', unit: 'req/s', default: 5000, rollup: 'min-path' },
      storageGb: { type: 'number', unit: 'GB', default: 100, rollup: 'sum' },
    },
  },
]

export function testRegistry() {
  const registry = createRegistry()
  for (const m of FIXTURE_MANIFESTS) registry.register(m)
  return registry
}

/** A core with a deterministic clock and id stream. */
export function createTestCore({
  seed = 1,
  registry = testRegistry(),
  clock = testClock(),
  ...rest
} = {}) {
  const prng = createPrng(seed)
  return createCore({ clock, random: n => prng.bytes(n), registry, actorId: 'tester', ...rest })
}

/** Creates a core with an initialised project; returns { core, root }. */
export function setup(options) {
  const core = createTestCore(options)
  const { rootSystemId } = core.dispatch({ type: 'project.init', payload: { name: 'Checkout' } })
  return { core, root: rootSystemId }
}

export function add(core, systemId, typeRef, name, extra = {}) {
  return core.dispatch({ type: 'node.add', payload: { systemId, typeRef, name, ...extra } })
}

export function port(core, nodeId, name) {
  const p = core.portsOf(nodeId).find(x => x.name === name)
  if (!p) throw new Error(`No port ${name} on ${core.node(nodeId)?.name}`)
  return p.id
}

export function connect(core, from, fromPort, to, toPort, extra = {}) {
  return core.dispatch({
    type: 'edge.connect',
    payload: { fromPort: port(core, from, fromPort), toPort: port(core, to, toPort), ...extra },
  })
}

/**
 * The payments example from spec §6: Web client → [Gateway → Payment service → Ledger DB,
 * Payment service → Settlement queue] → Bank API.
 */
export function buildPayments(core, root) {
  const client = add(core, root, 'base:client', 'Web client')
  const gateway = add(core, root, 'base:proxy', 'Gateway')
  const service = add(core, root, 'test.service', 'Payment service')
  const ledger = add(core, root, 'test.db', 'Ledger DB')
  const queue = add(core, root, 'acme.message-queue', 'Settlement queue')
  const bank = add(core, root, 'base:external', 'Bank API')
  // Settlement messages leave the queue for the bank over a worker that we do not model here.
  core.dispatch({
    type: 'port.add',
    payload: { nodeId: bank, name: 'events', direction: 'in', accepts: ['async-message'] },
  })
  const e = {
    clientGateway: connect(core, client, 'out', gateway, 'in', { connectionType: 'http' }),
    gatewayService: connect(core, gateway, 'out', service, 'in', { connectionType: 'http' }),
    serviceLedger: connect(core, service, 'db', ledger, 'in'),
    serviceQueue: null,
    queueBank: null,
  }
  core.dispatch({
    type: 'port.add',
    payload: { nodeId: service, name: 'publish', direction: 'out', accepts: ['async-message'] },
  })
  e.serviceQueue = connect(core, service, 'publish', queue, 'in')
  e.queueBank = connect(core, queue, 'out', bank, 'events')
  return { client, gateway, service, ledger, queue, bank, edges: e }
}

/** Snapshot without volatile fields, for comparing model states. */
export function modelState(core) {
  const snap = core.snapshot()
  const strip = rows => rows.map(({ rev, updatedAt, updatedBy, ...rest }) => rest)
  const out = {}
  for (const [key, value] of Object.entries(snap)) {
    if (key === 'rev' || key === 'schemaVersion') continue
    out[key] = Array.isArray(value) ? strip(value) : value && strip([value])[0]
  }
  return out
}
