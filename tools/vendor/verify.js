#!/usr/bin/env node
// @ts-check
// `npm run vendor:verify` (eng §16: runtime dependencies are vendored D3 and Three.js, each
// pinned by SHA-256). Every file in a vendored library's folder must be listed in
// vendor/manifest.json with the hash of its exact bytes; a changed, missing or unlisted file
// fails.
//
//   node tools/vendor/verify.js
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * @typedef {object} Library
 * @property {string} version
 * @property {string} licence   SPDX identifier
 * @property {string} source    where the files came from, unmodified
 * @property {string} [global]  the global a script library defines in the browser (fonts define none)
 * @property {Record<string, string>} files  path under vendor/ → 'sha256-<base64>'
 *
 * @typedef {object} VendorManifest
 * @property {1} schemaVersion
 * @property {Record<string, Library>} libraries
 */

/** The SRI-style SHA-256 of a file's bytes. @param {string} file */
export function pinOf(file) {
  return `sha256-${createHash('sha256').update(readFileSync(file)).digest('base64')}`
}

/**
 * @param {string} root
 * @returns {VendorManifest}
 */
export function readVendorManifest(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'vendor/manifest.json'), 'utf8'))
}

/**
 * Checks every vendored file against its pin.
 * @param {object} [options]
 * @param {string} [options.root]  the repository (or a copy of its vendor/ folder)
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyVendor({ root = ROOT } = {}) {
  const manifest = readVendorManifest(root)
  if (manifest.schemaVersion !== 1)
    return {
      ok: false,
      problems: [`vendor/manifest.json has schemaVersion ${manifest.schemaVersion}, expected 1`],
    }
  /** @type {string[]} */
  const problems = []
  for (const [name, library] of Object.entries(manifest.libraries)) {
    for (const [path, pin] of Object.entries(library.files)) {
      const file = join(root, 'vendor', path)
      if (!existsSync(file)) problems.push(`vendor/${path} is pinned but missing`)
      else if (pinOf(file) !== pin)
        problems.push(
          `vendor/${path} does not match its pin: expected ${pin}, found ${pinOf(file)}`
        )
    }
    const folder = join(root, 'vendor', name)
    const present = existsSync(folder)
      ? readdirSync(folder, { recursive: true, encoding: 'utf8' })
      : []
    for (const rel of present.sort()) {
      const path = `${name}/${rel.split('\\').join('/')}`
      if (!(path in library.files) && !statSync(join(folder, rel)).isDirectory())
        problems.push(`vendor/${path} is not pinned in vendor/manifest.json`)
    }
  }
  return { ok: problems.length === 0, problems }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, problems } = verifyVendor()
  for (const problem of problems) console.error(`vendor: ${problem}`)
  if (ok) console.log('Vendored files match their SHA-256 pins in vendor/manifest.json')
  process.exitCode = ok ? 0 : 1
}
