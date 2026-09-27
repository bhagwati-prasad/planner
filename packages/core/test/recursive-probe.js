// A model with composites by value and by reference, and a probe of what the recursive
// features compute on it, written only against core APIs that do not depend on how nodes store
// their inner systems. Task 0117 records the probe on the schema-version-2 model
// (test/fixtures/schema-v2/) and checks the migrated model gives the same results.
import { add, buildPayments, connect } from './helpers.js'

/**
 * Builds the payments example, extracts its middle into a system, and places a library system
 * by reference and by value.
 * @param {import('../src/index.js').Core} core
 * @param {string} root
 */
export function buildRecursive(core, root) {
  const m = buildPayments(core, root)
  core.dispatch({
    type: 'node.setProps',
    payload: { id: m.service, props: { monthlyCost: 120, technology: 'Node.js 20' } },
  })
  core.dispatch({
    type: 'node.setProps',
    payload: { id: m.ledger, props: { monthlyCost: 300, technology: 'PostgreSQL 16' } },
  })
  core.dispatch({
    type: 'system.extract',
    payload: {
      systemId: root,
      nodeIds: [m.gateway, m.service, m.ledger, m.queue],
      name: 'Payments',
    },
  })
  const auth = core.dispatch({ type: 'system.create', payload: { name: 'Auth' } })
  const token = add(core, auth, 'test.service', 'Token service', { props: { monthlyCost: 40 } })
  const store = add(core, auth, 'test.db', 'Token store')
  connect(core, token, 'db', store, 'in')
  core.dispatch({
    type: 'boundary.add',
    payload: {
      systemId: auth,
      name: 'in',
      direction: 'in',
      internalPortId: core.portsOf(token).find(p => p.name === 'in')?.id,
    },
  })
  core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: auth } })
  core.dispatch({
    type: 'node.place',
    payload: { systemId: root, systemRef: auth, placement: 'value' },
  })
}

/** @param {import('../src/index.js').Core} core @param {string} systemId */
function wiring(core, systemId) {
  const label = portId => {
    const p = core.port(portId)
    return `${core.node(p.nodeId).name}.${p.name}`
  }
  return core
    .edgesOf(systemId)
    .map(e => `${label(e.fromPort)} → ${label(e.toPort)}`)
    .sort()
}

/** @param {import('../src/index.js').Core} core @param {string} systemId */
const names = (core, systemId) =>
  core
    .nodesOf(systemId)
    .map(n => n.name)
    .sort()

/**
 * What roll-ups, the resolver, walk, detach and inline compute on the model from
 * buildRecursive. Mutates the core (it detaches and inlines).
 * @param {import('../src/index.js').Core} core
 */
export function probe(core) {
  const root = core.rootSystemId
  const byName = name => core.nodesOf(root).find(n => n.name === name)?.id
  const payments = byName('Payments')
  const byRef = byName('Auth')
  const byValue = byName('Auth 2')
  const out = {}
  out.rollups = Object.fromEntries(
    ['monthlyCost', 'serviceTime.p99', 'maxRps', 'technology'].map(key => [
      key,
      core.rollup(root, key).value,
    ])
  )
  out.walk = []
  core.walk(root, (node, { depth }) => out.walk.push(`${node.name}@${depth}`))
  out.walk.sort()
  out.readOnly = [payments, byRef, byValue].map(id => core.resolveSystem([id]).readOnly)
  out.inside = {
    payments: names(core, core.resolveSystem([payments]).systemId),
    byRef: names(core, core.resolveSystem([byRef]).systemId),
    byValue: names(core, core.resolveSystem([byValue]).systemId),
  }
  out.rootWiring = wiring(core, root)
  out.problems = core.problems().map(p => p.code)

  core.dispatch({ type: 'node.detach', payload: { id: byRef } })
  out.afterDetach = {
    readOnly: core.resolveSystem([byRef]).readOnly,
    inside: names(core, core.resolveSystem([byRef]).systemId),
  }
  core.dispatch({ type: 'system.inline', payload: { nodeId: payments } })
  out.afterInline = { root: names(core, root), wiring: wiring(core, root) }
  out.afterInlineRollups = { monthlyCost: core.rollup(root, 'monthlyCost').value }
  return out
}
