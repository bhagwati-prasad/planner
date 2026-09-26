/**
 * `strata test-component`: loads a packed component's behaviour the way the simulation
 * worker will (spec §7 "Sandbox"): in a fresh context with no network, storage or Node APIs,
 * seeded randomness and a fixed clock, under a time limit. Then checks its hooks.
 */
import { createContext, runInContext } from 'node:vm'
import { createModuleRuntime } from '../../server/src/index.js'

export const HOOKS = Object.freeze(['init', 'onMessage', 'onTimer', 'onFault'])

/**
 * The hook name closest to a misspelt one (at most two edits away), or undefined.
 * @param {string} name
 */
function closestHook(name) {
  const distance = (/** @type {string} */ a, /** @type {string} */ b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0]
      row[0] = i
      for (let j = 1; j <= b.length; j++) {
        const above = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
        diagonal = above
      }
    }
    return row[b.length]
  }
  const ranked = HOOKS.map(hook => ({
    hook,
    d: distance(name.toLowerCase(), hook.toLowerCase()),
  })).sort((a, b) => a.d - b.d)
  return ranked[0].d <= 2 ? ranked[0].hook : undefined
}

/**
 * Evaluates the bundle's modules in a sandbox and returns the namespace of `path`.
 * @param {import('../../server/src/index.js').ComponentBundle} bundle
 * @param {string} path
 * @param {{ timeout?: number }} [options]
 */
export function loadInSandbox(bundle, path, { timeout = 2000 } = {}) {
  const context = createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  })
  runInContext(
    `
    'use strict';
    (() => {
      let s = 0x9e3779b9
      Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
      Date.now = () => 0
    })()`,
    context
  )
  const table = `{${Object.entries(bundle.modules)
    .map(([p, src]) => `${JSON.stringify(p)}: ${src}`)
    .join(',\n')}}`
  return runInContext(
    `(${String(createModuleRuntime)})(${table}).load(${JSON.stringify(path)})`,
    context,
    { filename: `${bundle.manifest.id}.strata.js`, timeout }
  )
}

/**
 * @param {import('../../server/src/index.js').ComponentBundle} bundle
 * @returns {Promise<{ ok: boolean, messages: string[] }>}
 */
export async function checkBehaviour(bundle) {
  const messages = []
  let ok = true
  const bad = text => {
    ok = false
    messages.push(`✗ ${text}`)
  }
  if (!bundle.entry) {
    messages.push(`✓ Declarative: the ${bundle.manifest.extends ?? 'base'} behaviour applies`)
  } else {
    try {
      const ns = loadInSandbox(bundle, bundle.entry)
      const behaviour = ns.default
      if (!behaviour || typeof behaviour !== 'object')
        bad(`${bundle.entry} must export default an object of hooks (${HOOKS.join(', ')})`)
      else {
        const hooks = Object.keys(behaviour)
        for (const key of hooks) {
          if (!HOOKS.includes(key)) {
            const close = closestHook(key)
            bad(
              `Unknown hook '${key}'${close ? `. Did you mean '${close}'?` : `; hooks are ${HOOKS.join(', ')}`}`
            )
          } else if (typeof behaviour[key] !== 'function') bad(`${key} must be a function`)
        }
        if (ok)
          messages.push(
            `✓ Behaviour loads in the sandbox; hooks: ${hooks.join(', ') || 'none (the base behaviour applies)'}`
          )
      }
    } catch (err) {
      bad(`${bundle.entry} failed to load in the sandbox: ${err?.message ?? err}`)
    }
  }
  for (const [range, path] of Object.entries(bundle.manifest.migrations ?? {})) {
    try {
      const fn = loadInSandbox(bundle, String(path)).default
      if (typeof fn !== 'function')
        bad(`migrations['${range}'] (${path}) must export default a function (props) => props`)
      else messages.push(`✓ Migration ${range} loads`)
    } catch (err) {
      bad(`migrations['${range}'] failed to load: ${err?.message ?? err}`)
    }
  }
  return { ok, messages }
}
