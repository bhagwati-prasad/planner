// @ts-check
// Vendored libraries (task 0006): D3 and Three.js are pinned by SHA-256 in vendor/manifest.json
// and ship with their own licences (eng §1, §16).
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyVendor } from '../vendor/verify.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const manifest = () => JSON.parse(readFileSync(join(ROOT, 'vendor/manifest.json'), 'utf8'))

/** @type {string[]} */
const made = []
after(() => made.forEach(dir => rmSync(dir, { recursive: true, force: true })))

/** A copy of the repository's vendor/ folder to tamper with. */
function copyOfVendor() {
  const root = mkdtempSync(join(tmpdir(), 'strata-vendor-'))
  made.push(root)
  cpSync(join(ROOT, 'vendor'), join(root, 'vendor'), { recursive: true })
  return root
}

describe('npm run vendor:verify', () => {
  it('passes the vendored files as pinned, and is the npm script', () => {
    assert.deepEqual(verifyVendor().problems, [])
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(scripts['vendor:verify'], 'node tools/vendor/verify.js')
  })

  it('fails when any vendored byte changes', () => {
    const root = copyOfVendor()
    const file = join(root, 'vendor/three/three.core.js')
    const bytes = readFileSync(file)
    bytes[bytes.length >> 1] ^= 1
    writeFileSync(file, bytes)
    const result = verifyVendor({ root })
    assert.equal(result.ok, false)
    assert.equal(result.problems.length, 1)
    assert.match(result.problems[0], /^vendor\/three\/three\.core\.js does not match its pin/)
  })

  it('fails for a vendored file that is missing or not pinned', () => {
    const root = copyOfVendor()
    rmSync(join(root, 'vendor/d3/LICENSE'))
    writeFileSync(join(root, 'vendor/three/extra.js'), 'export const x = 1\n')
    assert.deepEqual(verifyVendor({ root }).problems, [
      'vendor/d3/LICENSE is pinned but missing',
      'vendor/three/extra.js is not pinned in vendor/manifest.json',
    ])
  })
})

describe('vendored licences', () => {
  it('D3 (ISC) and Three.js (MIT) licence files are present and listed', () => {
    const { schemaVersion, libraries } = manifest()
    assert.equal(schemaVersion, 1)
    assert.deepEqual(
      Object.entries(libraries).map(([name, lib]) => [name, lib.version, lib.licence]),
      [
        ['d3', '7.9.0', 'ISC'],
        ['three', '0.186.1', 'MIT'],
      ]
    )
    assert.ok('d3/LICENSE' in libraries.d3.files)
    assert.ok('three/LICENSE' in libraries.three.files)
    assert.match(readFileSync(join(ROOT, 'vendor/d3/LICENSE'), 'utf8'), /Permission to use, copy/)
    assert.match(readFileSync(join(ROOT, 'vendor/three/LICENSE'), 'utf8'), /The MIT License/)
    const readme = readFileSync(join(ROOT, 'vendor/README.md'), 'utf8')
    assert.match(readme, /^\| D3 \| 7\.9\.0 \|.*\| ISC \(`d3\/LICENSE`\) \|/m)
    assert.match(readme, /^\| Three\.js \| 0\.186\.1 \|.*\| MIT \(`three\/LICENSE`\) \|/m)
  })
})
