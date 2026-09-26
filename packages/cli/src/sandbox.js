/**
 * `strata test-component`: loads a packed component's behaviour the way the simulation
 * worker will (spec §7 "Sandbox"): in a fresh context with no network, storage or Node APIs,
 * seeded randomness and a fixed clock, under a time limit. Then checks its hooks.
 */
import { createContext, runInContext } from 'node:vm'
import { suggest } from '../../core/src/index.js'
import { createModuleRuntime } from '../../plugins/src/index.js'

export const HOOKS = Object.freeze(['init', 'onMessage', 'onTimer', 'onFault'])

/**
 * Evaluates the bundle's modules in a sandbox and returns the namespace of `path`.
 * @param {import('../../plugins/src/index.js').ComponentBundle} bundle
 * @param {string} path
 * @param {{ timeout?: number }} [options]
 */
export function loadInSandbox (bundle, path, { timeout = 2000 } = {}) {
  const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })
  runInContext(`
    'use strict';
    (() => {
      let s = 0x9e3779b9
      Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
      Date.now = () => 0
    })()`, context)
  const table = `{${Object.entries(bundle.modules).map(([p, src]) => `${JSON.stringify(p)}: ${src}`).join(',\n')}}`
  return runInContext(`(${String(createModuleRuntime)})(${table}).load(${JSON.stringify(path)})`, context, { filename: `${bundle.manifest.id}.strata.js`, timeout })
}

/**
 * @param {import('../../plugins/src/index.js').ComponentBundle} bundle
 * @returns {Promise<{ ok: boolean, messages: string[] }>}
 */
export async function checkBehaviour (bundle) {
  const messages = []
  let ok = true
  const bad = text => { ok = false; messages.push(`✗ ${text}`) }
  if (!bundle.entry) {
    messages.push(`✓ Declarative: the ${bundle.manifest.extends ?? 'base'} behaviour applies`)
  } else {
    try {
      const ns = loadInSandbox(bundle, bundle.entry)
      const behaviour = ns.default
      if (!behaviour || typeof behaviour !== 'object') bad(`${bundle.entry} must export default an object of hooks (${HOOKS.join(', ')})`)
      else {
        const hooks = Object.keys(behaviour)
        for (const key of hooks) {
          if (!HOOKS.includes(key)) {
            const [close] = suggest(key, HOOKS, 1)
            bad(`Unknown hook '${key}'${close ? `. Did you mean '${close}'?` : `; hooks are ${HOOKS.join(', ')}`}`)
          } else if (typeof behaviour[key] !== 'function') bad(`${key} must be a function`)
        }
        if (ok) messages.push(`✓ Behaviour loads in the sandbox; hooks: ${hooks.join(', ') || 'none (the base behaviour applies)'}`)
      }
    } catch (err) {
      bad(`${bundle.entry} failed to load in the sandbox: ${err?.message ?? err}`)
    }
  }
  for (const [range, path] of Object.entries(bundle.manifest.migrations ?? {})) {
    try {
      const fn = loadInSandbox(bundle, String(path)).default
      if (typeof fn !== 'function') bad(`migrations['${range}'] (${path}) must export default a function (props) => props`)
      else messages.push(`✓ Migration ${range} loads`)
    } catch (err) {
      bad(`migrations['${range}'] failed to load: ${err?.message ?? err}`)
    }
  }
  return { ok, messages }
}
