// Sample content for the app: a checkout built from the starter library (spec §8) that shows
// recursion (a system placed by value) and reuse (a library system placed by reference).

/**
 * Checkout: a web client and gateway in front of an Orders system (placed by value, with its
 * own service, database and queue) and a shared Auth system placed by reference.
 * @param {import('../packages/facade/src/index.js').Strata} strata
 */
export async function buildSampleProject(strata) {
  const p = await strata.projects.create('Checkout')
  const root = p.root
  const web = root.add('starter.client', { name: 'Web shop', at: { x: 40, y: 200 } })
  const gw = root.add('starter.api-gateway', {
    name: 'Edge gateway',
    props: { rateLimit: '1000/s', monthlyCost: 120 },
    at: { x: 280, y: 200 },
  })
  const orders = root.add('starter.service', {
    name: 'Orders API',
    props: { instances: 3, monthlyCost: 420 },
    at: { x: 540, y: 120 },
  })
  const db = root.add('starter.relational-db', {
    name: 'Orders DB',
    props: { monthlyCost: 610, technology: 'PostgreSQL 16' },
    at: { x: 540, y: 320 },
  })
  const queue = root.add('starter.message-queue', {
    name: 'Order events',
    props: { monthlyCost: 40 },
    at: { x: 800, y: 320 },
  })
  const bank = root.add('starter.third-party-api', {
    name: 'Payment provider',
    at: { x: 1060, y: 120 },
  })
  root.connect(web, gw, { label: 'HTTPS' })
  root.connect(gw, orders)
  root.connect(orders, db)
  root.connect(orders, queue)
  root.connect(orders, bank, { props: { timeout: '3s', retries: 1 } })
  const system = root.extract([orders, db, queue], { name: 'Orders' })
  system.set({ contract: { 'latency.p99': { max: 150, unit: 'ms' } } })

  const auth = p.createSystem('Auth', {
    levelTag: 'container',
    description: 'Shared identity service used by every product team.',
  })
  const idp = auth.add('starter.identity-provider', { name: 'Identity API', at: { x: 80, y: 80 } })
  const users = auth.add('starter.relational-db', { name: 'Users DB', at: { x: 80, y: 260 } })
  const tokens = auth.add('starter.cache', { name: 'Token cache', at: { x: 340, y: 80 } })
  auth.connect(idp, users)
  auth.connect(idp, tokens)
  auth.expose(idp.port('in'), { name: 'in' })
  const authNode = root.place(auth, { at: { x: 280, y: 420 } })
  root.connect(gw.port('out'), authNode.port('in'), { label: 'verify' })

  // Start the playground with a clean history, so Undo does not take the sample apart.
  p.clearHistory()
  return p
}
