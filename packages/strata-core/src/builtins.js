/**
 * Built-in base types (spec §7 "Behaviour API": base:client, base:service, base:queue,
 * base:topic, base:store, base:cache, base:proxy, base:timer, base:external).
 *
 * Here they carry only what the model needs: ports plus the properties and metrics common to
 * every component (spec §8 "Common to every component"). Their simulation behaviours arrive
 * with strata-sim in R1, and the concrete starter components that extend them (message queue,
 * relational DB, ...) arrive with the starter library in M4.
 *
 * Name, description, owner, tags, status and C4 level are fields of every node rather than
 * properties, so they are not repeated here.
 */

const common = {
  properties: {
    technology: { type: 'string', group: 'General', description: 'e.g. "PostgreSQL 16"', rollup: 'union' },
    environment: { type: 'string', group: 'Deployment', rollup: 'union' },
    region: { type: 'string', group: 'Deployment', rollup: 'union' },
    zone: { type: 'string', group: 'Deployment', rollup: 'union' },
    instances: { type: 'integer', default: 1, min: 0, group: 'Capacity', rollup: 'sum' },
    availabilityTarget: { type: 'percent', unit: '%', default: 99.9, min: 0, max: 100, group: 'Reliability', rollup: 'product' },
    monthlyCost: { type: 'number', unit: 'USD', default: 0, min: 0, group: 'Cost', rollup: 'sum' },
    links: { type: 'list', items: { type: 'string' }, default: [], group: 'General' }
  },
  metrics: {
    requestsIn: { unit: 'req/s', description: 'Requests arriving per second' },
    requestsOut: { unit: 'req/s', description: 'Requests sent downstream per second' },
    'latency.p50': { unit: 'ms', rollup: 'critical-path' },
    'latency.p95': { unit: 'ms', rollup: 'critical-path' },
    'latency.p99': { unit: 'ms', rollup: 'critical-path' },
    errorRate: { unit: '%', rollup: 'max' },
    utilisation: { unit: '%', rollup: 'max' },
    inFlight: { unit: 'requests', rollup: 'sum' },
    dropped: { unit: 'requests', rollup: 'sum' },
    health: { unit: 'state', rollup: { rule: 'worst', order: ['up', 'degraded', 'down'] } }
  }
}

const port = (name, direction, accepts = []) => ({ name, direction, accepts })

const base = (key, name, description, ports) => ({
  strataApi: '^1.0',
  id: `base:${key}`,
  name,
  version: '1.0.0',
  category: 'Base',
  extends: 'base:component',
  description,
  ports
})

export const BUILTIN_MANIFESTS = Object.freeze([
  {
    strataApi: '^1.0',
    id: 'base:component',
    name: 'Component',
    version: '1.0.0',
    category: 'Base',
    abstract: true,
    description: 'Properties and metrics shared by every component.',
    ports: [],
    properties: common.properties,
    metrics: common.metrics
  },
  base('client', 'Client', 'Originates requests: users, devices or upstream callers.', [port('out', 'out')]),
  base('service', 'Service', 'Handles requests and may call downstream dependencies.', [port('in', 'in'), port('out', 'out')]),
  base('queue', 'Queue', 'Buffers messages between producers and consumers.', [port('in', 'in', ['async-message']), port('out', 'out', ['async-message']), port('dlq', 'out', ['async-message'])]),
  base('topic', 'Topic', 'Publishes each message to every subscriber group.', [port('in', 'in', ['async-message']), port('out', 'out', ['async-message'])]),
  base('store', 'Store', 'Keeps data: databases, key-value stores, object storage.', [port('in', 'in')]),
  base('cache', 'Cache', 'Answers repeated reads without reaching the origin.', [port('in', 'in'), port('origin', 'out')]),
  base('proxy', 'Proxy', 'Forwards traffic: load balancers, gateways, CDNs.', [port('in', 'in'), port('out', 'out')]),
  base('timer', 'Timer', 'Emits work on a schedule.', [port('out', 'out')]),
  base('external', 'External system', 'A dependency outside the modelled architecture.', [port('in', 'in')])
])
