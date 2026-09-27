// @ts-check
/**
 * The shared recursive fixture (eng §9): the payments example of spec §7, built through
 * commands only, so every package can test recursive features against the same model.
 *
 *   Checkout (root): Web client → [Payments] → Bank API
 *     Payments (by value): Gateway → Payment service → [Ledger], → Settlement queue → out,
 *                          → [Fraud check] (opened), → [Auth] (by reference, read-only)
 *       Ledger (by value): Ledger API → Ledger DB
 *       Fraud check (a component opened as a system, keeping its own properties): Rules engine → Model store
 *       Auth (a library system): Token service → Token store
 *
 * Three levels deep. Every public method of every composite is bound all the way down:
 * Payments.authorise → Payment service; Payments.refund → Ledger.reverse → Ledger API;
 * Fraud check.score → Rules engine; Auth.verify → Token service.
 */

/** @param {string} name @param {'in'|'out'} direction @param {string[]} accepts @param {string[]} [exposes] */
const port = (name, direction, accepts, exposes) => ({
  name,
  direction,
  accepts,
  ...(exposes ? { exposes } : {}),
})
/** @param {string[]} names */
const methods = names => ({ public: Object.fromEntries(names.map(n => [n, {}])) })
const serviceTime = (/** @type {number} */ ms) => ({
  serviceTime: { type: 'distribution', unit: 'ms', default: ms, rollup: 'critical-path' },
})

/** The component types the fixture uses, besides the built-in base types. */
export const FIXTURE_MANIFESTS = Object.freeze([
  {
    id: 'fixture.gateway',
    name: 'Gateway',
    version: '1.0.0',
    extends: 'base:proxy',
    ports: [port('in', 'in', ['http'], ['authorise', 'refund']), port('out', 'out', ['http'])],
    methods: methods(['authorise', 'refund']),
    properties: serviceTime(2),
  },
  {
    id: 'fixture.payment-service',
    name: 'Payment service',
    version: '1.0.0',
    extends: 'base:service',
    ports: [
      port('in', 'in', ['http'], ['authorise', 'refund']),
      port('ledger', 'out', ['http']),
      port('fraud', 'out', ['http']),
      port('auth', 'out', ['http']),
      port('publish', 'out', ['async-message']),
    ],
    methods: methods(['authorise', 'refund']),
    properties: serviceTime(20),
  },
  {
    id: 'fixture.ledger-api',
    name: 'Ledger API',
    version: '1.0.0',
    extends: 'base:service',
    ports: [port('in', 'in', ['http'], ['record', 'reverse']), port('db', 'out', ['db-protocol'])],
    methods: methods(['record', 'reverse']),
    properties: serviceTime(8),
  },
  {
    id: 'fixture.fraud',
    name: 'Fraud check',
    version: '1.0.0',
    extends: 'base:service',
    ports: [port('in', 'in', ['http'], ['score'])],
    methods: methods(['score']),
    properties: serviceTime(10),
  },
  {
    id: 'fixture.rules-engine',
    name: 'Rules engine',
    version: '1.0.0',
    extends: 'base:service',
    ports: [port('in', 'in', ['http'], ['score']), port('model', 'out', ['db-protocol'])],
    methods: methods(['score']),
    properties: serviceTime(6),
  },
  {
    id: 'fixture.token-service',
    name: 'Token service',
    version: '1.0.0',
    extends: 'base:service',
    ports: [port('in', 'in', ['http'], ['verify']), port('store', 'out', ['db-protocol'])],
    methods: methods(['verify']),
    properties: serviceTime(3),
  },
  {
    id: 'fixture.database',
    name: 'Database',
    version: '1.0.0',
    extends: 'base:store',
    ports: [port('in', 'in', ['db-protocol'])],
    properties: {
      ...serviceTime(4),
      storageGb: { type: 'number', unit: 'GB', default: 100, rollup: 'sum' },
    },
  },
])

/**
 * Registers the fixture's component types.
 * @param {import('../../packages/core/src/index.js').Registry} registry
 */
export function registerFixtureTypes(registry) {
  for (const manifest of FIXTURE_MANIFESTS) registry.register(manifest)
}

/**
 * Builds the fixture in a core whose registry has the fixture types, with commands only. The
 * same seed gives the same model, ids included.
 * @param {import('../../packages/core/src/index.js').Core} core
 * @returns {Record<string, any>} the ids of the parts, and `authPath`, the path to the read-only Auth system
 */
export function buildRecursivePayments(core) {
  /** @param {string} type @param {Record<string, any>} payload */
  const run = (type, payload) => core.dispatch({ type, payload })
  const { rootSystemId: root } = run('project.init', { name: 'Checkout' })
  /** @param {string} systemId @param {string} typeRef @param {string} name @param {Record<string, unknown>} [props] */
  const add = (systemId, typeRef, name, props) =>
    run('component.add', { systemId, typeRef, name, ...(props ? { props } : {}) })
  /** @param {string} nodeId @param {string} name */
  const portOf = (nodeId, name) =>
    /** @type {string} */ (core.portsOf(nodeId).find(p => p.name === name)?.id)
  /** @param {string} from @param {string} fromPort @param {string} to @param {string} toPort @param {string|null} [method] */
  const connect = (from, fromPort, to, toPort, method = null) =>
    run('edge.add', { fromPort: portOf(from, fromPort), toPort: portOf(to, toPort), method })
  /** @param {string} nodeId @param {string} name */
  const boundaryOf = (nodeId, name) =>
    /** @type {string} */ (core.portsOf(nodeId).find(p => p.name === name)?.boundaryPortId)
  /** @param {string} boundaryPortId @param {string} method @param {string} nodeId @param {string} target */
  const bind = (boundaryPortId, method, nodeId, target) =>
    run('boundary.bind', { boundaryPortId, method, nodeId, target })

  // Auth, a library system: placed by reference, so read-only where it is placed.
  const auth = run('system.create', { name: 'Auth' })
  const tokenService = add(auth, 'fixture.token-service', 'Token service')
  const tokenStore = add(auth, 'fixture.database', 'Token store', { storageGb: 5 })
  connect(tokenService, 'store', tokenStore, 'in')
  const authIn = run('boundary.add', {
    systemId: auth,
    name: 'in',
    direction: 'in',
    internalPortId: portOf(tokenService, 'in'),
  })
  bind(authIn, 'verify', tokenService, 'verify')

  // The payments flow, flat at first.
  const client = add(root, 'base:client', 'Web client')
  const gateway = add(root, 'fixture.gateway', 'Gateway')
  const service = add(root, 'fixture.payment-service', 'Payment service', { monthlyCost: 120 })
  const ledgerApi = add(root, 'fixture.ledger-api', 'Ledger API')
  const ledgerDb = add(root, 'fixture.database', 'Ledger DB', { monthlyCost: 300 })
  const queue = add(root, 'base:queue', 'Settlement queue')
  const fraud = add(root, 'fixture.fraud', 'Fraud check', { serviceTime: 15 })
  const bank = add(root, 'base:external', 'Bank API')
  connect(client, 'out', gateway, 'in')
  connect(gateway, 'out', service, 'in')
  connect(service, 'ledger', ledgerApi, 'in', 'record')
  connect(ledgerApi, 'db', ledgerDb, 'in')
  connect(service, 'publish', queue, 'in')
  connect(queue, 'out', bank, 'in')
  connect(service, 'fraud', fraud, 'in', 'score')

  // Ledger, by value: extract binds record, the method its entering edge calls; reverse is
  // declared by binding it too.
  const ledger = run('system.extract', {
    systemId: root,
    nodeIds: [ledgerApi, ledgerDb],
    name: 'Ledger',
  })
  bind(boundaryOf(ledger.nodeId, 'in'), 'reverse', ledgerApi, 'reverse')

  // Payments, by value, one level up: the Ledger goes inside it.
  const payments = run('system.extract', {
    systemId: root,
    nodeIds: [gateway, service, ledger.nodeId, queue, fraud],
    name: 'Payments',
  })
  const paymentsIn = boundaryOf(payments.nodeId, 'in')
  bind(paymentsIn, 'authorise', service, 'authorise')
  bind(paymentsIn, 'refund', ledger.nodeId, 'reverse')

  // Fraud check, opened as a system: it keeps its type and properties as its black-box model.
  const fraudInner = run('component.openAsSystem', { id: fraud })
  const rules = add(fraudInner, 'fixture.rules-engine', 'Rules engine')
  const model = add(fraudInner, 'fixture.database', 'Model store', { storageGb: 20 })
  connect(rules, 'model', model, 'in')
  const fraudIn = boundaryOf(fraud, 'in')
  run('boundary.update', { id: fraudIn, changes: { internalPortId: portOf(rules, 'in') } })
  bind(fraudIn, 'score', rules, 'score')
  run('boundary.update', {
    id: boundaryOf(fraud, 'out'),
    changes: { internalPortId: portOf(rules, 'out') },
  })

  // Auth, placed by reference inside Payments.
  const authRef = run('node.place', { systemId: payments.systemId, systemRef: auth })
  connect(service, 'auth', authRef, 'in', 'verify')

  return {
    root,
    client,
    bank,
    payments: payments.nodeId,
    paymentsSystem: payments.systemId,
    gateway,
    service,
    queue,
    ledger: ledger.nodeId,
    ledgerSystem: ledger.systemId,
    ledgerApi,
    ledgerDb,
    fraud,
    fraudSystem: fraudInner,
    rules,
    model,
    auth,
    authRef,
    authPath: [payments.nodeId, authRef],
    tokenService,
    tokenStore,
  }
}
