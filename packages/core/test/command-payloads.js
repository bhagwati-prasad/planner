// Payload generators for the inverse round-trip property (eng §7 "Checklist for a new
// command"): one per registered command type. Each takes a model snapshot and a seeded random
// source and returns a payload for that command, or null when the model has nothing it could
// apply to. A payload may still be refused (a name already taken, an incompatible port); the
// property then checks that the refusal changed nothing.

/** @typedef {import('../../../tools/testing/gen.js').Random} Random */
/** @typedef {Record<string, any>} Snapshot */
/** @typedef {(snap: Snapshot, random: Random) => Record<string, any> | null} PayloadGenerator */

const NAMES = ['Orders', 'Billing', 'Cache', 'Queue', 'Gateway', 'Search', 'Ledger', 'Auth']
const TYPES = [
  'base:service',
  'base:client',
  'base:proxy',
  'base:external',
  'test.service',
  'test.db',
  'acme.message-queue',
]
const DIRECTIONS = ['in', 'out', 'both']

/** @template T @param {Random} random @param {T[]} list @returns {T | null} */
const pick = (random, list) => (list.length ? list[random.uint32() % list.length] : null)
/** @param {Random} random @param {number} n */
const below = (random, n) => random.uint32() % n
/** @param {Random} random */
const name = random => `${pick(random, NAMES)}${below(random, 3) || ''}`

/** Wraps a generator so it only runs once the project exists. @param {PayloadGenerator} fn @returns {PayloadGenerator} */
const inProject = fn => (snap, random) => (snap.project ? fn(snap, random) : null)

/** Empty `accepts` takes any connection type; a mirror port's is null (it follows its boundary port). @param {string[]|null} a @param {string[]|null} b */
const compatible = (a, b) => !a?.length || !b?.length || a.some(type => b.includes(type))

/**
 * A source and target port that could carry an edge: an output into an input on another node
 * of the same system, accepting a common connection type. Any system, or only `systemId`.
 * @param {Snapshot} snap
 * @param {Random} random
 * @param {string} [systemId]
 */
function connectable(snap, random, systemId) {
  const nodes = new Map(snap.nodes.map(n => [n.id, n]))
  const ports = snap.ports.filter(p => !systemId || nodes.get(p.nodeId)?.systemId === systemId)
  const pairs = []
  for (const from of ports.filter(p => p.direction !== 'in'))
    for (const to of ports.filter(p => p.direction !== 'out'))
      if (
        from.nodeId !== to.nodeId &&
        nodes.get(from.nodeId)?.systemId === nodes.get(to.nodeId)?.systemId &&
        compatible(from.accepts, to.accepts)
      )
        pairs.push({ fromPort: from.id, toPort: to.id })
  return pick(random, pairs)
}

/** @type {Record<string, PayloadGenerator>} */
export const PAYLOADS = {
  'project.init': (snap, random) => (snap.project ? null : { name: name(random) }),
  'project.update': inProject((_, random) => ({ changes: { name: name(random) } })),

  'system.create': inProject((_, random) => ({ name: name(random) })),
  'system.update': inProject((snap, random) => {
    const system = pick(random, snap.systems)
    return { id: system.id, changes: { description: name(random) } }
  }),
  'system.delete': inProject((snap, random) => {
    const system = pick(
      random,
      snap.systems.filter(s => s.id !== snap.project.rootSystemId)
    )
    return system && { id: system.id }
  }),

  'component.add': inProject((snap, random) => ({
    systemId: pick(random, snap.systems).id,
    typeRef: pick(random, TYPES),
    name: name(random),
  })),
  'node.place': inProject((snap, random) => {
    const target = pick(
      random,
      snap.systems.filter(s => s.id !== snap.project.rootSystemId)
    )
    if (!target) return null
    return {
      systemId: pick(random, snap.systems).id,
      systemRef: target.id,
      // Only a system no composite owns can be placed by reference.
      placement: target.ownerNodeId ? 'value' : pick(random, ['reference', 'value']),
    }
  }),
  'node.update': inProject((snap, random) => {
    const node = pick(random, snap.nodes)
    return node && { id: node.id, changes: { name: name(random) } }
  }),
  'node.setProps': inProject((snap, random) => {
    const node = pick(
      random,
      snap.nodes.filter(n => n.kind === 'atomic')
    )
    return node && { id: node.id, props: { instances: below(random, 9) } }
  }),
  'node.remove': inProject((snap, random) => {
    const node = pick(random, snap.nodes)
    return node && { id: node.id }
  }),
  'node.detach': inProject((snap, random) => {
    const node = pick(
      random,
      snap.nodes.filter(n => n.placement === 'reference')
    )
    return node && { id: node.id }
  }),

  'port.add': inProject((snap, random) => {
    const node = pick(random, snap.nodes)
    return (
      node && {
        nodeId: node.id,
        name: `p${below(random, 4)}`,
        direction: pick(random, DIRECTIONS),
        accepts: [pick(random, ['http', 'grpc', 'async-message'])],
      }
    )
  }),
  'port.update': inProject((snap, random) => {
    const port = pick(
      random,
      snap.ports.filter(p => !p.declared)
    )
    return port && { id: port.id, changes: { name: `q${below(random, 4)}` } }
  }),
  'port.remove': inProject((snap, random) => {
    const port = pick(
      random,
      snap.ports.filter(p => !p.declared)
    )
    return port && { id: port.id }
  }),

  'edge.add': inProject((snap, random) => connectable(snap, random)),
  'edge.update': inProject((snap, random) => {
    const edge = pick(random, snap.edges)
    return edge && { id: edge.id, changes: { label: name(random) } }
  }),
  'edge.setProps': inProject((snap, random) => {
    const edge = pick(random, snap.edges)
    return edge && { id: edge.id, props: { bandwidth: 1 + below(random, 999) } }
  }),
  'edge.rewire': inProject((snap, random) => {
    const edge = pick(random, snap.edges)
    const ends = edge && connectable(snap, random, edge.systemId)
    return ends && { id: edge.id, ...ends }
  }),
  'edge.remove': inProject((snap, random) => {
    const edge = pick(random, snap.edges)
    return edge && { id: edge.id }
  }),

  'boundary.add': inProject((snap, random) => ({
    systemId: pick(random, snap.systems).id,
    name: `b${below(random, 4)}`,
    direction: pick(random, DIRECTIONS),
  })),
  'boundary.update': inProject((snap, random) => {
    const bp = pick(random, snap.boundaryPorts)
    return bp && { id: bp.id, changes: { name: `c${below(random, 4)}` } }
  }),
  'boundary.remove': inProject((snap, random) => {
    const bp = pick(random, snap.boundaryPorts)
    return bp && { id: bp.id }
  }),

  'view.create': inProject((snap, random) => ({
    systemId: pick(random, snap.systems).id,
    name: name(random),
  })),
  'view.update': inProject((snap, random) => {
    const view = pick(random, snap.views)
    return view && { id: view.id, changes: { name: name(random) } }
  }),
  'view.remove': inProject((snap, random) => {
    const view = pick(random, snap.views)
    return view && { id: view.id }
  }),
  'view.layout': inProject((snap, random) => {
    const view = pick(random, snap.views)
    const node =
      view &&
      pick(
        random,
        snap.nodes.filter(n => n.systemId === view.systemId)
      )
    return (
      node && {
        viewId: view.id,
        set: { [node.id]: { x: below(random, 800), y: below(random, 600) } },
      }
    )
  }),
  'view.hide': inProject((snap, random) => {
    const view = pick(random, snap.views)
    const node =
      view &&
      pick(
        random,
        snap.nodes.filter(n => n.systemId === view.systemId)
      )
    return node && { viewId: view.id, ids: [node.id] }
  }),
  'view.show': inProject((snap, random) => {
    const view = pick(
      random,
      snap.views.filter(v => v.hidden.length)
    )
    return view && { viewId: view.id, ids: [pick(random, view.hidden)] }
  }),

  'system.extract': inProject((snap, random) => {
    const system = pick(random, snap.systems)
    const nodes = snap.nodes.filter(n => n.systemId === system.id)
    const first = pick(random, nodes)
    if (!first) return null
    const second = pick(random, nodes)
    const nodeIds = second && second.id !== first.id ? [first.id, second.id] : [first.id]
    return { systemId: system.id, nodeIds }
  }),
  'system.inline': inProject((snap, random) => {
    const node = pick(
      random,
      snap.nodes.filter(n => n.kind === 'composite')
    )
    return node && { nodeId: node.id }
  }),

  'model.restore': inProject((snap, random) => {
    const kind = pick(random, ['node', 'system', 'view'])
    const table = { node: 'nodes', system: 'systems', view: 'views' }[kind]
    const entity = pick(random, snap[table])
    return (
      entity && { entities: [{ kind, id: entity.id, value: { ...entity, name: name(random) } }] }
    )
  }),
  batch: inProject((snap, random) => {
    const commands = []
    for (let i = 0; i < 1 + below(random, 3); i++) {
      const type = pick(
        random,
        Object.keys(PAYLOADS).filter(t => t !== 'batch')
      )
      const payload = PAYLOADS[type](snap, random)
      if (payload) commands.push({ type, payload })
    }
    return commands.length ? { commands } : null
  }),
}
