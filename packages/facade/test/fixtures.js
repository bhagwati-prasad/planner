// Stand-ins for starter-library components (the real library arrives in M4), shaped like the
// console example in spec §16.
import { createPrng } from '../../core/src/index.js'
import { createStrata, createMemoryStorage } from '../src/index.js'

export const STARTER = [
  {
    id: 'starter.api-gateway',
    name: 'API gateway',
    version: '1.0.0',
    category: 'Edge',
    extends: 'base:proxy',
    ports: [
      { name: 'in', direction: 'in', accepts: ['http'] },
      { name: 'out', direction: 'out', accepts: ['http', 'grpc'] },
    ],
    properties: {
      rateLimit: { type: 'number', unit: 'req/s', default: 500, min: 0 },
      latency: {
        type: 'distribution',
        unit: 'ms',
        default: { kind: 'lognormal', median: 1, p99: 5 },
      },
    },
  },
  {
    id: 'starter.service',
    name: 'Service',
    version: '1.0.0',
    category: 'Compute',
    extends: 'base:service',
    ports: [
      { name: 'in', direction: 'in', accepts: ['http', 'grpc'] },
      { name: 'out', direction: 'out', accepts: ['http', 'grpc'] },
      { name: 'db', direction: 'out', accepts: ['db-protocol'] },
    ],
    properties: {
      latency: {
        type: 'distribution',
        unit: 'ms',
        default: { kind: 'lognormal', median: 20, p99: 80 },
      },
      concurrency: { type: 'integer', default: 50, min: 1 },
    },
  },
  {
    id: 'starter.relational-db',
    name: 'Relational DB',
    version: '1.0.0',
    category: 'Data',
    extends: 'base:store',
    ports: [{ name: 'in', direction: 'in', accepts: ['db-protocol'] }],
    properties: {
      latency: {
        type: 'distribution',
        unit: 'ms',
        default: { kind: 'lognormal', median: 2, p99: 15 },
      },
      maxConnections: { type: 'integer', default: 100, min: 1 },
    },
  },
]

/** A facade with deterministic ids and time, the starter stand-ins registered, and captured output. */
export function createTestStrata({
  storage = createMemoryStorage(),
  seed = 1,
  start = Date.UTC(2026, 8, 25, 9),
} = {}) {
  const prng = createPrng(seed)
  let now = start
  const printed = []
  const strata = createStrata({
    storage,
    clock: () => now,
    random: n => prng.bytes(n),
    identity: { id: 'user-1', name: 'Ada' },
    output: text => printed.push(text),
  })
  for (const m of STARTER) strata.components.register(m)
  return {
    strata,
    printed,
    storage,
    tick: (ms = 1000) => {
      now += ms
    },
  }
}
