/**
 * Copy, paste and duplicate across systems (spec §9 canvas features). A clip is plain JSON,
 * so it can travel through the system clipboard between tabs and windows.
 *
 * Nodes keep their type, name, properties and extra ports; edges between copied nodes come
 * along. Composites placed by reference paste as another reference to the same library
 * system; composites placed by value paste as a fresh copy of their system (so the source
 * must still exist when pasting).
 */
import { fail, nodeKind } from '../../core/src/index.js'
import { CORE, defined } from './internal.js'

export const CLIP_FORMAT = 'strata/clip@1'

/**
 * @typedef {object} ClipNode
 * @property {number} key
 * @property {'atomic'|'composite'} kind
 * @property {string|null} typeRef
 * @property {string|null} systemRef
 * @property {'reference'|'value'|null} placement
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} props
 * @property {string[]} tags
 * @property {string|null} owner
 * @property {string} status
 * @property {{ name: string, direction: string, accepts: string[] }[]} extraPorts
 * @property {{ x: number, y: number, w?: number, h?: number }|null} at  position relative to the clip origin
 *
 * @typedef {object} Clip
 * @property {string} format
 * @property {ClipNode[]} nodes
 * @property {{ from: { node: number, port: string }, to: { node: number, port: string }, connectionType: string|null, props: object, label: string }[]} edges
 */

/**
 * @param {import('./projects.js').ProjectHandle} project
 * @param {Iterable<string>} ids node ids (edge ids are ignored: edges between copied nodes come along)
 * @returns {Clip}
 */
/**
 * An entity's own property values as a person writes them, so pasting reads them back to the
 * same stored values: a percentage stored as 0.999 is written 99.9 (see core's inputValue).
 * @param {any} core
 * @param {string} id  a node or an edge
 * @param {Record<string, unknown>} props
 */
function writtenProps(core, id, props) {
  const explained = core.explainProps(id)
  return Object.fromEntries(
    Object.keys(props).map(key => [key, structuredClone(explained[key]?.input ?? props[key])])
  )
}

export function copyNodes(project, ids) {
  const core = project[CORE]
  const nodes = [...new Set(ids)].map(id => core.get('node', id)).filter(Boolean)
  if (!nodes.length) fail('INVALID', 'Nothing to copy: select one or more nodes')
  const keyOf = new Map(nodes.map((n, i) => [n.id, i]))
  const position = n => {
    const [view] = core.viewsOf(n.systemId)
    const entry = view?.layout[n.id]
    return entry && typeof entry.x === 'number'
      ? { x: entry.x, y: entry.y, w: entry.w, h: entry.h }
      : null
  }
  const placed = nodes.map(position)
  const xs = placed.filter(Boolean).map(p => p.x)
  const ys = placed.filter(Boolean).map(p => p.y)
  const origin = { x: xs.length ? Math.min(...xs) : 0, y: ys.length ? Math.min(...ys) : 0 }

  const clipNodes = nodes.map((n, key) => {
    const p = placed[key]
    return {
      key,
      kind: nodeKind(n),
      typeRef: n.typeRef,
      systemRef: n.innerSystemRef,
      placement: n.placement,
      name: n.name,
      description: n.description,
      props: writtenProps(core, n.id, n.props),
      tags: [...n.tags],
      owner: n.owner,
      status: n.status,
      extraPorts: core
        .portsOf(n.id)
        .filter(port => !port.declared)
        .map(port => ({
          name: port.name,
          direction: port.direction,
          accepts: [...(port.accepts ?? [])],
        })),
      at: p
        ? {
            x: p.x - origin.x,
            y: p.y - origin.y,
            ...(p.w ? { w: p.w } : {}),
            ...(p.h ? { h: p.h } : {}),
          }
        : null,
    }
  })

  const edges = []
  const seen = new Set()
  for (const n of nodes) {
    for (const port of core.portsOf(n.id)) {
      for (const edge of core.edgesAtPort(port.id)) {
        if (seen.has(edge.id)) continue
        seen.add(edge.id)
        const from = core.get('port', edge.fromPort)
        const to = core.get('port', edge.toPort)
        if (!from || !to || !keyOf.has(from.nodeId) || !keyOf.has(to.nodeId)) continue
        edges.push({
          from: { node: /** @type {number} */ (keyOf.get(from.nodeId)), port: from.name },
          to: { node: /** @type {number} */ (keyOf.get(to.nodeId)), port: to.name },
          connectionType: edge.connectionType,
          props: writtenProps(core, edge.id, edge.props),
          label: edge.label,
        })
      }
    }
  }
  return { format: CLIP_FORMAT, nodes: clipNodes, edges }
}

/**
 * Pastes a clip into a system as one undoable step.
 * @param {import('./handles.js').SystemHandle} system
 * @param {Clip} clip
 * @param {{ at?: { x: number, y: number } }} [options] where the clip's top-left lands (default: right of the existing nodes)
 * @returns {{ nodeIds: string[], edgeIds: string[], skipped: { name: string, reason: string }[] }}
 */
export function pasteClip(system, clip, { at } = {}) {
  if (!clip || clip.format !== CLIP_FORMAT || !Array.isArray(clip.nodes))
    fail('INVALID', 'Not a Strata clip')
  const project = system.project
  const core = project[CORE]
  const [view] = core.viewsOf(system.id)
  const target = at ?? freeSpot(core, system.id, view)
  const taken = new Set(core.nodesOf(system.id).map(n => n.name))
  const nameFor = name => {
    let candidate = name
    for (let i = 1; taken.has(candidate); i++)
      candidate = i === 1 ? `${name} copy` : `${name} copy ${i}`
    taken.add(candidate)
    return candidate
  }
  /** @type {Map<number, string>} */
  const created = new Map()
  const skipped = []
  const edgeIds = []

  project.transaction(
    () => {
      const layout = {}
      for (const n of clip.nodes) {
        try {
          let id
          if (n.kind === 'composite') {
            if (!n.systemRef || !core.get('system', n.systemRef))
              throw new Error('its system no longer exists')
            id = project.dispatch({
              type: 'node.place',
              payload: {
                systemId: system.id,
                systemRef: n.systemRef,
                placement: n.placement ?? 'reference',
                name: nameFor(n.name),
              },
            })
          } else {
            id = project.dispatch({
              type: 'component.add',
              payload: defined({
                systemId: system.id,
                typeRef: n.typeRef,
                name: nameFor(n.name),
                props: n.props,
                tags: n.tags,
                owner: n.owner,
                status: n.status,
                description: n.description,
              }),
            })
            for (const port of n.extraPorts ?? [])
              project.dispatch({ type: 'port.add', payload: defined({ nodeId: id, ...port }) })
          }
          created.set(n.key, id)
          const rel = n.at ?? { x: 0, y: 0 }
          layout[id] = {
            x: target.x + rel.x,
            y: target.y + rel.y,
            ...(rel.w ? { w: rel.w } : {}),
            ...(rel.h ? { h: rel.h } : {}),
          }
        } catch (err) {
          skipped.push({ name: n.name, reason: /** @type {Error} */ (err).message })
        }
      }
      for (const e of clip.edges ?? []) {
        const fromNode = created.get(e.from.node)
        const toNode = created.get(e.to.node)
        if (!fromNode || !toNode) continue
        const fromPort = core.portsOf(fromNode).find(p => p.name === e.from.port)
        const toPort = core.portsOf(toNode).find(p => p.name === e.to.port)
        if (!fromPort || !toPort) continue
        try {
          edgeIds.push(
            project.dispatch({
              type: 'edge.add',
              payload: defined({
                fromPort: fromPort.id,
                toPort: toPort.id,
                connectionType: e.connectionType,
                props: e.props,
                label: e.label,
              }),
            })
          )
        } catch (err) {
          skipped.push({
            name: `${e.from.port} → ${e.to.port}`,
            reason: /** @type {Error} */ (err).message,
          })
        }
      }
      if (view && Object.keys(layout).length)
        project.dispatch({ type: 'view.layout', payload: { viewId: view.id, set: layout } })
    },
    { label: `Paste ${created.size} node(s)` }
  )

  return { nodeIds: [...created.values()], edgeIds, skipped }
}

/** Top-left of free space to the right of what is already laid out. */
function freeSpot(core, systemId, view) {
  const entries = Object.entries(view?.layout ?? {}).filter(
    ([id, e]) => core.get('node', id) && typeof e.x === 'number'
  )
  if (!entries.length) return { x: 40, y: 40 }
  const right = Math.max(...entries.map(([, e]) => e.x + (e.w ?? 160)))
  const top = Math.min(...entries.map(([, e]) => e.y))
  return { x: Math.round((right + 80) / 10) * 10, y: Math.round(top / 10) * 10 }
}
