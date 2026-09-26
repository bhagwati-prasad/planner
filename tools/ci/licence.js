#!/usr/bin/env node
// @ts-check
// The licence gate (eng §19). Strata's own code is proprietary (eng §1), so it checks what
// comes from elsewhere: every installed package in package-lock.json carries a permissive
// licence, and every vendored library is one eng §16 approves and ships its own licence file
// with the licence eng §1 names.
//
//   node tools/ci/licence.js
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** SPDX identifiers that allow use in proprietary software without conditions on our code. */
export const ALLOWED = Object.freeze([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'Python-2.0',
])

/** Vendored libraries (eng §3, §16) and the licence each keeps (eng §1). */
export const VENDORED = Object.freeze({ d3: 'ISC', three: 'MIT', plex: 'OFL-1.1' })

/** How each vendored licence is recognised in its licence file. */
const LICENCE_TEXT = {
  ISC: /Permission to use, copy, modify, and\/or distribute this software for any purpose/,
  MIT: /Permission is hereby granted, free of charge, to any person/,
  'OFL-1.1': /SIL OPEN FONT LICENSE\s+Version 1\.1/i,
}
const LICENCE_FILE = /^(LICEN[CS]E|OFL)(\.(md|txt))?$/i

/**
 * Whether an SPDX expression is satisfied by the allow-list: any side of an OR, every side
 * of an AND.
 * @param {string} expression
 */
function allowed(expression) {
  const inner = expression.trim().replace(/^\((.*)\)$/, '$1')
  if (/\sOR\s/.test(inner)) return inner.split(/\s+OR\s+/).some(allowed)
  if (/\sAND\s/.test(inner)) return inner.split(/\s+AND\s+/).every(allowed)
  return ALLOWED.includes(inner)
}

/** Problems with the packages npm installs. @param {string} root @returns {string[]} */
function dependencyProblems(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  return Object.entries(lock.packages ?? {})
    .filter(([path, entry]) => path.includes('node_modules/') && !entry.link)
    .flatMap(([path, entry]) => {
      const name = `${path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)}@${entry.version}`
      if (!entry.license) return [`${name} declares no licence`]
      if (!allowed(entry.license))
        return [`${name} is ${entry.license}, which is not on the allow-list`]
      return []
    })
}

/** Problems with one folder of vendor/. @param {string} vendor @param {string} name @returns {string[]} */
function vendoredProblems(vendor, name) {
  const expected = VENDORED[/** @type {keyof typeof VENDORED} */ (name)]
  if (!expected) return [`vendor/${name} is not an approved vendored library (eng §16)`]
  const file = readdirSync(join(vendor, name)).find(f => LICENCE_FILE.test(f))
  if (!file) return [`vendor/${name} has no LICENSE file`]
  if (!LICENCE_TEXT[expected].test(readFileSync(join(vendor, name, file), 'utf8')))
    return [`vendor/${name}/${file} is not the ${expected} licence eng §1 names`]
  return []
}

/**
 * @param {object} [options]
 * @param {string} [options.root]  the repository (or a fixture shaped like one)
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkLicences({ root = ROOT } = {}) {
  const vendor = join(root, 'vendor')
  const libraries = existsSync(vendor)
    ? readdirSync(vendor, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()
    : []
  const problems = [
    ...dependencyProblems(root),
    ...libraries.flatMap(name => vendoredProblems(vendor, name)),
  ]
  return { ok: problems.length === 0, problems }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, problems } = checkLicences()
  for (const problem of problems) console.error(`licence: ${problem}`)
  if (ok) console.log('Licences: every dependency and vendored library is on the allow-list')
  process.exitCode = ok ? 0 : 1
}
