/**
 * Text renderings of the model for the console and terminal (spec §16: "strata.print(root) —
 * text tree of the system"). Text is one of three interchangeable renderers, beside 2D and 3D.
 */
import { nodeKind } from '../../core/src/index.js'
import { Collection } from './collection.js'
import { CORE } from './internal.js'
import {
  BoundaryPortHandle,
  EdgeHandle,
  NodeHandle,
  PortHandle,
  SystemHandle,
  portLabel,
} from './handles.js'
import { ProjectHandle } from './projects.js'

/** @typedef {import('../../core/src/index.js').Core} Core */

/**
 * @param {unknown} target
 * @param {{ depth?: number, edges?: boolean }} [options]
 */
export function formatTarget(target, options = {}) {
  if (target instanceof ProjectHandle) return formatProject(target, options)
  if (target instanceof SystemHandle) return formatSystem(target[CORE], target.id, options)
  if (target instanceof NodeHandle) return formatNode(target)
  if (
    target instanceof PortHandle ||
    target instanceof EdgeHandle ||
    target instanceof BoundaryPortHandle
  )
    return String(target)
  if (target instanceof Collection || Array.isArray(target)) {
    const rows = target instanceof Collection ? target.toTable() : target
    return formatTable(rows)
  }
  if (target && typeof target === 'object') return JSON.stringify(target, null, 2)
  return String(target)
}

/** @param {ProjectHandle} project @param {{ depth?: number, edges?: boolean }} options */
function formatProject(project, options) {
  const core = project[CORE]
  const lines = [
    `Project ${project.name} · rev ${project.rev} · ${plural(core.all('system').length, 'system')} · ${plural(core.all('node').length, 'node')}`,
  ]
  lines.push(formatSystem(core, core.rootSystemId, options))
  const library = core.all('system').filter(s => s.id !== core.rootSystemId && !s.ownerNodeId)
  if (library.length) {
    lines.push('', 'Library')
    for (const system of library) lines.push(formatSystem(core, system.id, options))
  }
  return lines.join('\n')
}

/**
 * Tree of a system: nodes (composites expanded), and each node's outgoing edges.
 * @param {Core} core
 * @param {string} systemId
 * @param {{ depth?: number, edges?: boolean }} [options] depth: levels of nodes to show (default all)
 */
export function formatSystem(core, systemId, { depth = Infinity, edges = true } = {}) {
  const system = core.require('system', systemId)
  const bps = core.boundaryPortsOf(systemId)
  const header = [
    `${system.name}  [${system.levelTag ?? 'system'}]`,
    plural(core.nodesOf(systemId).length, 'node'),
    ...(bps.length ? [`ports: ${bps.map(bp => boundaryLabel(core, bp)).join(', ')}`] : []),
  ].join(' · ')
  const out = [header]

  const walk = (sysId, prefix, levelsLeft, stack) => {
    const nodes = core.nodesOf(sysId)
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1
      out.push(prefix + (last ? '└─ ' : '├─ ') + nodeLabel(core, node))
      const inner = prefix + (last ? '   ' : '│  ')
      if (edges) {
        for (const port of core.portsOf(node.id)) {
          for (const edge of core.find('edge', 'fromPort', port.id))
            out.push(
              `${inner}  ${port.name} → ${portLabel(core, edge.toPort)}${edge.connectionType ? `  (${edge.connectionType})` : ''}${edge.label ? `  “${edge.label}”` : ''}`
            )
        }
      }
      if (
        nodeKind(node) === 'composite' &&
        levelsLeft > 1 &&
        core.get('system', node.innerSystemRef) &&
        !stack.has(node.innerSystemRef)
      ) {
        walk(node.innerSystemRef, inner, levelsLeft - 1, new Set([...stack, node.innerSystemRef]))
      }
    })
  }
  walk(systemId, '', depth, new Set([systemId]))
  return out.join('\n')
}

/** @param {Core} core @param {any} node */
function nodeLabel(core, node) {
  const status = node.status !== 'planned' ? ` · ${node.status}` : ''
  if (nodeKind(node) !== 'composite') return `${node.name}  ${node.typeRef}${status}`
  const child = core.get('system', node.innerSystemRef)
  const how =
    node.placement === 'reference'
      ? `by reference${child && child.name !== node.name ? ` → ${child.name}` : ''}`
      : 'by value'
  return `▣ ${node.name}  (${how} · ${plural(child ? core.nodesOf(child.id).length : 0, 'node')})${status}`
}

/** @param {Core} core @param {any} bp */
function boundaryLabel(core, bp) {
  const arrow = bp.direction === 'out' ? '←' : bp.direction === 'in' ? '→' : '↔'
  return `${bp.name} ${arrow} ${bp.internalPortId ? portLabel(core, bp.internalPortId) : '(unmapped)'}`
}

/** @param {NodeHandle} node */
function formatNode(node) {
  const core = node[CORE]
  const e = node.entity
  const lines = [
    `${e.name}  ${nodeKind(e) === 'composite' ? nodeLabel(core, e).slice(e.name.length + 2) : e.typeRef} · ${e.status}${e.owner ? ` · owner ${e.owner}` : ''}`,
  ]
  const ports = core.portsOf(e.id)
  if (ports.length) {
    lines.push('  ports')
    for (const port of ports) {
      const links = core
        .edgesAtPort(port.id)
        .map(edge =>
          edge.fromPort === port.id
            ? `→ ${portLabel(core, edge.toPort)}`
            : `← ${portLabel(core, edge.fromPort)}`
        )
      for (const bp of core.find('boundaryPort', 'internalPortId', port.id))
        links.push(`⇠ boundary port '${bp.name}' of ${core.get('system', bp.systemId)?.name}`)
      const accepts = core.acceptsOf(port.id)
      lines.push(
        `    ${port.name} (${port.direction}${accepts.length ? `, ${accepts.join('|')}` : ''})${links.length ? `  ${links.join(', ')}` : ''}`
      )
    }
  }
  if (nodeKind(e) === 'atomic') {
    const props = Object.entries(core.explainProps(e.id))
    if (props.length) {
      lines.push('  props')
      for (const [key, { input, source, unit }] of props) {
        // As written: a percentage in points, a duration as '4 d' (ADR 0008).
        const suffix = unit && typeof input === 'number' ? (unit === '%' ? '%' : ` ${unit}`) : ''
        lines.push(
          `    ${key} = ${typeof input === 'string' ? input : JSON.stringify(input)}${suffix}${source === 'default' ? '  (default)' : ''}`
        )
      }
    }
  }
  return lines.join('\n')
}

/**
 * Plain-text table of row objects.
 * @param {Record<string, unknown>[]} rows
 */
export function formatTable(rows) {
  if (!rows.length) return '(empty)'
  if (rows.some(r => r === null || typeof r !== 'object')) return rows.map(String).join('\n')
  const columns = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const cell = v =>
    v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  const widths = columns.map(c => Math.max(c.length, ...rows.map(r => cell(r[c]).length)))
  const line = values =>
    values
      .map((v, i) => v.padEnd(widths[i]))
      .join('  ')
      .trimEnd()
  return [
    line(columns),
    line(widths.map(w => '─'.repeat(w))),
    ...rows.map(r => line(columns.map(c => cell(r[c])))),
  ].join('\n')
}

/** @param {number} n @param {string} word */
function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
