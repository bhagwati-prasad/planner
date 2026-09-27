/**
 * Memoised roll-ups (spec §7, eng §9). A result is kept per system, key and rule, and each
 * system carries a revision: a committed change bumps it for every system the change touched and
 * every system above those, so a system's cached roll-ups stay valid while nothing in its
 * subtree changed. Registering or removing a component type invalidates every result, because
 * manifests give values their defaults and rules.
 */
import { deepFreeze } from './plain.js'
import { rollup } from './rollup.js'
import { referencingNodes } from './model.js'

/**
 * @typedef {import('./model.js').Source} Source
 * @typedef {import('./rollup.js').RollupOptions} RollupOptions
 * @typedef {import('./rollup.js').RollupResult} RollupResult
 */

export class RollupCache {
  #src
  #registry
  /** @type {Map<string, { rev: number, registry: number, result: RollupResult }>} */
  #results = new Map()
  /** @type {Map<string, number>} */
  #revs = new Map()

  /**
   * @param {Source} src
   * @param {import('./registry.js').Registry} registry
   */
  constructor(src, registry) {
    this.#src = src
    this.#registry = registry
  }

  /**
   * The roll-up of `key` over a system, from the cache while nothing below the system changed.
   * A value source (`options.values`) is read afresh every time, so it is never cached.
   * @param {string} systemId
   * @param {string} key
   * @param {RollupOptions} [options]
   * @returns {RollupResult}
   */
  get(systemId, key, options = {}) {
    if (options.values) return rollup(this.#src, this.#registry, systemId, key, options)
    const id = JSON.stringify([
      systemId,
      key,
      options.rule ?? null,
      options.abstract ? [...options.abstract].sort() : null,
    ])
    const rev = this.#revs.get(systemId) ?? 0
    const registry = this.#registry.revision ?? 0
    const hit = this.#results.get(id)
    if (hit && hit.rev === rev && hit.registry === registry) return hit.result
    const result = deepFreeze(rollup(this.#src, this.#registry, systemId, key, options))
    this.#results.set(id, { rev, registry, result })
    return result
  }

  /**
   * Bumps the revision of every system an operation touched, before or after it, and of every
   * system above those.
   * @param {{ inverse?: { payload?: { entities?: { kind: string, id: string, value: any }[] } } }} op
   */
  invalidate(op) {
    const src = this.#src
    const entities = op.inverse?.payload?.entities ?? []
    const before = new Map(entities.map(e => [`${e.kind}|${e.id}`, e.value]))
    /** @param {string} nodeId */
    const systemOfNode = nodeId =>
      (src.get('node', nodeId) ?? before.get(`node|${nodeId}`))?.systemId
    /** @type {Set<string>} */
    const touched = new Set()
    for (const { kind, id, value } of entities)
      for (const entity of [value, src.get(kind, id)]) {
        if (!entity) continue
        const systemId =
          kind === 'system'
            ? entity.id
            : kind === 'port'
              ? systemOfNode(entity.nodeId)
              : ['node', 'edge', 'boundaryPort'].includes(kind)
                ? entity.systemId
                : undefined
        if (systemId) touched.add(systemId)
      }
    const seen = new Set()
    const queue = [...touched]
    while (queue.length) {
      const systemId = /** @type {string} */ (queue.shift())
      if (seen.has(systemId)) continue
      seen.add(systemId)
      this.#revs.set(systemId, (this.#revs.get(systemId) ?? 0) + 1)
      for (const node of referencingNodes(src, systemId)) queue.push(node.systemId)
    }
  }
}
