// @ts-check
// Reads the rules the lint plugin enforces from the engineering guidelines themselves, so the
// documents and the checks cannot drift apart (eng §6: "The import-boundary lint rule reads
// this table").
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ENG6 = join(ROOT, 'docs/guidelines/engineering/06-architecture-and-dependency-rules.md')

/** Packages that run only in Node and may import `node:` built-ins (eng §3: cli, server). */
export const NODE_PACKAGES = new Set(['cli', 'server'])

/**
 * @typedef {object} Boundaries
 * @property {Map<string, Set<string>>} packages  package → Strata packages it may import
 * @property {Map<string, Set<string>>} bare      package → bare specifiers it may import (d3, three)
 * @property {Set<string>} bannedIn               packages where the banned globals apply
 * @property {string[]} bannedGlobals             e.g. 'window', 'Date.now', 'new Date()'
 */

/** @type {Boundaries|null} */
let cached = null

/** Names in a table cell or a sentence: `a`, `b` and `c` → ['a', 'b', 'c']. @param {string} text */
const names = text =>
  text
    .replace(/`/g, '')
    .split(/,\s*|\s+and\s+/)
    .map(s => s.trim())
    .filter(Boolean)

/** @returns {Boundaries} */
export function boundaries() {
  if (cached) return cached
  const text = readFileSync(ENG6, 'utf8')
  /** @type {Boundaries} */
  const out = { packages: new Map(), bare: new Map(), bannedIn: new Set(), bannedGlobals: [] }
  for (const line of text.split('\n')) {
    const row = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(line)
    if (!row || row[1] === 'Package' || /^-+$/.test(row[1])) continue
    const allowed = row[2]
    const only = /^(\w+) only/.exec(allowed)
    for (const pkg of names(row[1])) {
      out.packages.set(pkg, new Set(allowed === 'nothing' || only ? [] : names(allowed)))
      out.bare.set(pkg, new Set(only ? [only[1]] : []))
    }
  }
  const banned = /In (.+?), these globals are banned: (.+?)\. \*\*\(lint\)\*\*/.exec(text)
  if (!banned) throw new Error(`Cannot read the banned globals from ${ENG6}`)
  for (const pkg of names(banned[1])) out.bannedIn.add(pkg)
  out.bannedGlobals = names(banned[2]).map(g => g.replace(/ without an argument$/, ''))
  if (out.packages.size < 10) throw new Error(`Cannot read the dependency table from ${ENG6}`)
  cached = out
  return out
}

/**
 * The package a file belongs to and where in it: packages/<pkg>/<area>/...
 * @param {string} filename absolute path
 * @returns {{ pkg: string, area: string }|null}
 */
export function locate(filename) {
  const rel = filename.startsWith(ROOT) ? filename.slice(ROOT.length).replace(/\\/g, '/') : null
  const m = rel && /^\/?packages\/([^/]+)\/([^/]+)\//.exec(rel)
  return m ? { pkg: m[1], area: m[2] } : null
}
