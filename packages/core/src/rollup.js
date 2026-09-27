/**
 * Roll-up engine (spec §6 "Data roll-up"). Component manifests declare how each property
 * and metric aggregates upward; systems can override per key. A composite node's value is the
 * roll-up of the system it contains, so values flow up through any depth.
 *
 * Rules:
 *   sum, min, max, count, union, worst  aggregate over the nodes of a system;
 *   critical-path  longest total along any in → out path (latency);
 *   min-path       bottleneck (lowest value) along the in → out paths (throughput);
 *                  (path rules follow synchronous edges only)
 *   product        product along each in → out path, worst path wins (availability).
 *
 * Paths start at the internal ports of `in` boundary ports (or at nodes with no inbound edges)
 * and end at `out` boundary ports (or at sinks). Cycles are broken at back edges.
 */
import { fail } from './errors.js'
import { isPlainObject } from './plain.js'
import { ROLLUP_RULES, statistic } from './props.js'
import { decimal } from './units.js'
import {
  boundaryPortsOf,
  edgesOf,
  effectiveProps,
  manifestOf,
  nodesOf,
  portsOf,
  subtreeSystemIds,
} from './model.js'

const PATH_RULES = new Set(['critical-path', 'min-path', 'product'])
const DEFAULT_WORST_ORDER = ['up', 'degraded', 'down']

/**
 * @typedef {object} RuleSpec
 * @property {string} rule
 * @property {unknown[]} [order]   worst: values from best to worst
 * @property {Record<string, unknown>} [where]  count: node filter { status, tag, kind, extends, owner, type }
 * @property {number} [scale]      product: what a value of 1 is written as (percentages are fractions)
 * @property {string} [unit]
 *
 * @typedef {object} RollupOptions
 * @property {string|RuleSpec} [rule]  force a rule
 * @property {(node: any, key: string) => unknown} [values]  value source consulted before properties (e.g. simulation metrics)
 * @property {Iterable<string>} [abstract]  systems to treat as black boxes, valued from their contract
 *
 * @typedef {object} RollupResult
 * @property {string} systemId
 * @property {string} key
 * @property {string} rule
 * @property {unknown} value        undefined when no node has a value
 * @property {string} [unit]
 * @property {{nodeId: string, value: unknown}[]} contributors
 * @property {string[]} missing     nodes without a value for the key
 * @property {string[]} [path]      critical-path / product: the deciding path, as node ids
 * @property {string} [bottleneck]  min-path: the limiting node
 */

/**
 * @param {unknown} spec
 * @param {{ type?: string, unit?: string }} [schema]
 * @returns {RuleSpec}
 */
function normalizeRule(spec, schema) {
  /** @type {RuleSpec|null} */
  const obj =
    typeof spec === 'string'
      ? { rule: spec }
      : isPlainObject(spec)
        ? { .../** @type {RuleSpec} */ (spec) }
        : null
  if (!obj || !ROLLUP_RULES.includes(obj.rule))
    fail(
      'INVALID',
      `Unknown roll-up rule ${JSON.stringify(spec)}; use one of ${ROLLUP_RULES.join(', ')}`
    )
  if (obj.unit === undefined && schema?.unit) obj.unit = schema.unit
  return obj
}

/**
 * Finds the rule for `key`: explicit option, then the system's own overrides, then the first
 * manifest in the subtree that declares one (metric `key`, or property named by the first
 * segment of `key`).
 * @param {import('./model.js').Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {string} systemId
 * @param {string} key
 * @param {string|RuleSpec} [explicit]
 */
export function resolveRule(src, registry, systemId, key, explicit) {
  const head = key.split('.')[0]
  const subtree = subtreeSystemIds(src, systemId)
  /** @type {{ type?: string, unit?: string }|undefined} */
  let schema
  let declared
  search: for (const id of subtree) {
    for (const node of nodesOf(src, id)) {
      const manifest = manifestOf(registry, node)
      if (!manifest) continue
      const metric = manifest.metrics[key]
      const prop = manifest.properties[head]
      if (!schema && (metric || prop))
        schema = metric ? { unit: metric.unit } : { type: prop.type, unit: prop.unit }
      const rule = metric?.rollup ?? prop?.rollup
      if (rule !== undefined) {
        declared = rule
        schema =
          metric?.rollup !== undefined
            ? { unit: metric.unit }
            : { type: prop.type, unit: prop.unit }
        break search
      }
    }
  }
  const spec =
    explicit ??
    src.require('system', systemId).rollups?.[key] ??
    declared ??
    subtree.map(id => src.require('system', id).rollups?.[key]).find(Boolean)
  if (spec === undefined) {
    const system = src.require('system', systemId)
    fail(
      'NO_ROLLUP_RULE',
      `No roll-up rule for '${key}' in '${system.name}'. Declare 'rollup' on the property or metric in a component manifest, set rollups['${key}'] on the system, or pass { rule }.`,
      { key }
    )
  }
  return normalizeRule(spec, schema)
}

/**
 * The value of `key` on one atomic node: from `options.values`, else from its properties.
 * A distribution property answers statistics: 'serviceTime.p99', 'serviceTime.mean'.
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {any} node
 * @param {string} key
 * @param {RollupOptions['values']} [values]
 */
export function nodeValue(registry, node, key, values, depth = 0) {
  if (values) {
    const v = values(node, key)
    if (v !== undefined) return v
  }
  const props = effectiveProps(registry, node)
  const [head, ...rest] = key.split('.')
  if (!(head in props)) {
    // A metric may name the property that estimates it until the simulation measures it,
    // e.g. "latency.p99": { "estimate": "serviceTime.p99" }.
    const estimate = manifestOf(registry, node)?.metrics?.[key]?.estimate
    return typeof estimate === 'string' && estimate !== key && depth < 4
      ? nodeValue(registry, node, estimate, undefined, depth + 1)
      : undefined
  }
  const schema = manifestOf(registry, node)?.properties?.[head]
  let value = props[head]
  // Stored values are canonical (ADR 0008), so nothing converts here.
  if (rest.length === 0) return value
  if (schema?.type === 'distribution' && rest.length === 1) return statistic(value, rest[0])
  for (const seg of rest) {
    if (value === null || typeof value !== 'object') return undefined
    value = value[seg]
  }
  return value
}

/**
 * The value a contract implies for a black-box system (spec §6 "Simulation level of detail").
 * @param {any} system
 * @param {string} key
 */
export function contractValue(system, key) {
  const target = system.contract?.[key]
  if (!target) return undefined
  return target.equals ?? target.max ?? target.min
}

/**
 * @param {any} node
 * @param {Record<string, unknown>} where
 * @param {import('./registry.js').Registry|undefined} registry
 */
function matches(node, where, registry) {
  if (where.kind !== undefined && node.kind !== where.kind) return false
  if (where.status !== undefined && node.status !== where.status) return false
  if (where.owner !== undefined && node.owner !== where.owner) return false
  if (where.tag !== undefined && !node.tags.includes(where.tag)) return false
  if (
    where.type !== undefined &&
    !(node.typeRef === where.type || node.typeRef?.startsWith(`${where.type}@`))
  )
    return false
  if (
    where.extends !== undefined &&
    !(node.typeRef && registry?.isA(node.typeRef, String(where.extends)))
  )
    return false
  return true
}

/**
 * Derives `key` for a system.
 * @param {import('./model.js').Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {string} systemId
 * @param {string} key
 * @param {RollupOptions} [options]
 * @returns {RollupResult}
 */
export function rollup(src, registry, systemId, key, options = {}) {
  if (typeof key !== 'string' || !key)
    fail('INVALID', 'A roll-up needs a key such as "latency.p99"')
  const spec = resolveRule(src, registry, systemId, key, options.rule)
  const abstract = new Set(options.abstract ?? [])
  return aggregate(
    src,
    registry,
    src.require('system', systemId),
    key,
    spec,
    { ...options, abstract },
    new Set()
  )
}

function aggregate(src, registry, system, key, spec, options, stack) {
  if (stack.has(system.id)) fail('CYCLE', `System '${system.name}' contains itself`)
  stack.add(system.id)
  const override = system.rollups?.[key]
  const rule = override && !options.rule ? normalizeRule(override, spec) : spec

  /** @type {Map<string, unknown>} */
  const values = new Map()
  const contributors = []
  const missing = []
  for (const node of nodesOf(src, system.id)) {
    let value
    if (node.kind === 'composite') {
      const child = src.get('system', node.systemRef)
      if (child) {
        value = options.abstract.has(child.id)
          ? undefined
          : aggregate(src, registry, child, key, spec, options, stack).value
        if (value === undefined) value = contractValue(child, key)
      }
    } else if (rule.rule === 'count' && rule.where) {
      value = matches(node, rule.where, registry) ? 1 : 0
    } else {
      value = nodeValue(registry, node, key, options.values)
    }
    if (value === undefined || value === null) {
      missing.push(node.id)
      continue
    }
    values.set(node.id, value)
    contributors.push({ nodeId: node.id, value })
  }
  stack.delete(system.id)

  const result = {
    systemId: system.id,
    key,
    rule: rule.rule,
    value: undefined,
    unit: rule.unit,
    contributors,
    missing,
  }
  if (PATH_RULES.has(rule.rule))
    return Object.assign(result, pathAggregate(src, registry, system, values, rule))

  const numbers = contributors.map(c => c.value).filter(v => typeof v === 'number')
  switch (rule.rule) {
    case 'sum':
    case 'count':
      result.value = numbers.length
        ? numbers.reduce((a, b) => a + b, 0)
        : rule.rule === 'count'
          ? 0
          : undefined
      break
    case 'min':
      result.value = numbers.length ? Math.min(...numbers) : undefined
      break
    case 'max':
      result.value = numbers.length ? Math.max(...numbers) : undefined
      break
    case 'union': {
      const set = new Set()
      for (const { value } of contributors)
        for (const v of Array.isArray(value) ? value : [value]) set.add(v)
      result.value = [...set].sort((a, b) => String(a).localeCompare(String(b)))
      break
    }
    case 'worst': {
      const order = rule.order ?? DEFAULT_WORST_ORDER
      let worst
      let rank = -1
      for (const { value } of contributors) {
        const r = order.indexOf(value)
        if (r > rank) {
          rank = r
          worst = value
        }
      }
      result.value = worst
      break
    }
  }
  return result
}

/**
 * Path rules describe a synchronous request: they follow edges whose connection mode is
 * 'sync' and stop at asynchronous hand-offs (a message on a queue does not add to the
 * caller's latency, lower its throughput or its availability).
 * @param {import('./model.js').Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {any} system
 * @param {Map<string, unknown>} values
 * @param {RuleSpec} rule
 */
function pathAggregate(src, registry, system, values, rule) {
  const nodes = nodesOf(src, system.id)
  const portOwner = new Map()
  for (const node of nodes)
    for (const port of portsOf(src, node.id)) portOwner.set(port.id, node.id)
  /** @type {Map<string, Set<string>>} */
  const succ = new Map(nodes.map(n => [n.id, new Set()]))
  // Entry points are nodes nothing calls, synchronously or not; a consumer fed by a queue is
  // not an entry point, so it is simply off the request path.
  const hasPred = new Set()
  for (const edge of edgesOf(src, system.id)) {
    const a = portOwner.get(edge.fromPort)
    const b = portOwner.get(edge.toPort)
    if (!a || !b || a === b) continue
    hasPred.add(b)
    if (effectiveProps(registry, edge).mode !== 'async') succ.get(a)?.add(b)
  }
  const bps = boundaryPortsOf(src, system.id)
  const endpoints = dirs => [
    ...new Set(
      bps
        .filter(bp => dirs.includes(bp.direction) && bp.internalPortId)
        .map(bp => portOwner.get(bp.internalPortId))
        .filter(Boolean)
    ),
  ]
  let sources = endpoints(['in', 'both'])
  if (!sources.length) sources = nodes.filter(n => !hasPred.has(n.id)).map(n => n.id)
  if (!sources.length) sources = nodes.map(n => n.id)

  // Depth-first search from the sources, dropping back edges, gives a DAG and a topological order.
  const state = new Map()
  /** @type {Map<string, string[]>} */
  const dag = new Map()
  const postorder = []
  for (const start of sources) {
    if (state.has(start)) continue
    const stack = [{ id: start, next: [...(succ.get(start) ?? [])] }]
    state.set(start, 1)
    dag.set(start, [])
    while (stack.length) {
      const top = stack[stack.length - 1]
      const next = top.next.shift()
      if (next === undefined) {
        stack.pop()
        state.set(top.id, 2)
        postorder.push(top.id)
        continue
      }
      if (state.get(next) === 1) continue // back edge closes a cycle: ignore it
      ;/** @type {string[]} */ (dag.get(top.id)).push(next)
      if (!state.has(next)) {
        state.set(next, 1)
        dag.set(next, [])
        stack.push({ id: next, next: [...(succ.get(next) ?? [])] })
      }
    }
  }
  let targets = endpoints(['out', 'both']).filter(id => state.has(id))
  if (!targets.length) targets = postorder.filter(id => (dag.get(id) ?? []).length === 0)

  // Keep only nodes on some source → target path.
  const pred = new Map(postorder.map(id => [id, []]))
  for (const [a, list] of dag) for (const b of list) pred.get(b).push(a)
  const relevant = new Set()
  const queue = [...targets]
  while (queue.length) {
    const id = /** @type {string} */ (queue.pop())
    if (relevant.has(id)) continue
    relevant.add(id)
    queue.push(...(pred.get(id) ?? []))
  }
  const topo = [...postorder].reverse().filter(id => relevant.has(id))
  const num = id =>
    typeof values.get(id) === 'number' ? /** @type {number} */ (values.get(id)) : undefined

  if (rule.rule === 'min-path') {
    let value
    let bottleneck
    for (const id of topo) {
      const v = num(id)
      if (v !== undefined && (value === undefined || v < value)) {
        value = v
        bottleneck = id
      }
    }
    return { value, bottleneck, sources, targets }
  }

  const isProduct = rule.rule === 'product'
  const scale = rule.scale ?? 1
  const best = new Map()
  const via = new Map()
  let anyValue = false
  for (const id of topo) {
    const v = num(id)
    if (v !== undefined) anyValue = true
    const weight = isProduct ? (v === undefined ? 1 : v / scale) : (v ?? 0)
    let from
    let base = isProduct ? 1 : 0
    for (const p of pred.get(id) ?? []) {
      if (!best.has(p)) continue
      const b = best.get(p)
      if (from === undefined || (isProduct ? b < base : b > base)) {
        base = b
        from = p
      }
    }
    best.set(id, isProduct ? base * weight : base + weight)
    via.set(id, from)
  }
  if (!anyValue) return { value: undefined, path: [], sources, targets }
  let end
  for (const t of targets) {
    if (!best.has(t)) continue
    if (
      end === undefined ||
      (isProduct ? best.get(t) < best.get(end) : best.get(t) > best.get(end))
    )
      end = t
  }
  const path = []
  for (let id = end; id !== undefined; id = via.get(id)) path.unshift(id)
  const raw = end === undefined ? undefined : best.get(end)
  return {
    value: raw === undefined ? undefined : isProduct ? raw * scale : raw,
    path,
    sources,
    targets,
  }
}

/**
 * Compares a system's derived values with its declared contract.
 * @param {import('./model.js').Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {string} systemId
 * @param {RollupOptions} [options]
 * @returns {{ key: string, target: any, value: unknown, status: 'ok'|'violated'|'unknown', message: string }[]}
 */
export function checkContracts(src, registry, systemId, options = {}) {
  const system = src.require('system', systemId)
  return Object.entries(system.contract ?? {}).map(([key, target]) => {
    let result
    try {
      result = rollup(src, registry, systemId, key, options)
    } catch (err) {
      if (/** @type {any} */ (err).code === 'NO_ROLLUP_RULE') {
        return {
          key,
          target,
          value: undefined,
          status: /** @type {const} */ ('unknown'),
          message: `'${system.name}': no roll-up rule for contract key '${key}'`,
        }
      }
      throw err
    }
    const value = result.value
    const unit = target.unit ?? result.unit ?? ''
    // Percentages are fractions (ADR 0008), shown in points.
    const fmt = v =>
      typeof v === 'number' && unit === '%'
        ? `${+Number(decimal(v, 2)).toFixed(3)}%`
        : `${typeof v === 'number' ? +v.toFixed(3) : JSON.stringify(v)}${unit ? ` ${unit}` : ''}`
    if (target.equals !== undefined && value !== undefined && value !== target.equals) {
      return {
        key,
        target,
        value,
        status: /** @type {const} */ ('violated'),
        message: `'${system.name}': ${key} is ${fmt(value)}, contract requires ${fmt(target.equals)}`,
      }
    }
    if (typeof value !== 'number') {
      return {
        key,
        target,
        value,
        status: /** @type {'unknown'|'ok'} */ (value === undefined ? 'unknown' : 'ok'),
        message: `'${system.name}': ${key} ${value === undefined ? 'has no derived value yet' : 'is not numeric'}`,
      }
    }
    if (target.max !== undefined && value > target.max) {
      return {
        key,
        target,
        value,
        status: /** @type {const} */ ('violated'),
        message: `'${system.name}': ${key} is ${fmt(value)}, above the contract maximum of ${fmt(target.max)}`,
      }
    }
    if (target.min !== undefined && value < target.min) {
      return {
        key,
        target,
        value,
        status: /** @type {const} */ ('violated'),
        message: `'${system.name}': ${key} is ${fmt(value)}, below the contract minimum of ${fmt(target.min)}`,
      }
    }
    return {
      key,
      target,
      value,
      status: /** @type {const} */ ('ok'),
      message: `'${system.name}': ${key} is ${fmt(value)}, within contract`,
    }
  })
}
