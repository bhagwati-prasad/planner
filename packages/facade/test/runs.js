// @ts-check
// Runs for the facade's simulation tests (tasks 0417, 0429): the starter gateway, service and
// relational DB packed as `strata pack` packs them, a strata with them installed, and orders
// for the service to insert into the database.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFakeClock, createRandom } from '../../../tools/testing/index.js'
import { createMemoryStorage, createStrata } from '../src/index.js'
import { packComponent } from '../../plugins/src/index.js'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Starter plugins packed as `strata pack` packs them. @param {string[]} folders */
function packed(folders) {
  return folders.map(folder => {
    const dir = join(ROOT, folder)
    /** @type {Record<string, Uint8Array>} */
    const files = {}
    /** @param {string} d */
    const walk = d => {
      for (const entry of readdirSync(d)) {
        const path = join(d, entry)
        if (statSync(path).isDirectory()) walk(path)
        else files[relative(dir, path).split('\\').join('/')] = readFileSync(path)
      }
    }
    walk(dir)
    const { bundle, problems } = packComponent(files, { name: folder.split('/').at(-1) })
    assert.deepEqual(problems, [], `${folder} packs cleanly`)
    return /** @type {any} */ (bundle)
  })
}

export const STARTER = packed([
  'components/api-gateway',
  'components/service',
  'components/relational-db',
  'connection-types/http',
  'connection-types/db-protocol',
])

/**
 * A strata with the starter gateway, service and relational DB installed, and a project called
 * checkout, which runs simulations through `simHost`.
 * @param {any} simHost
 */
export async function checkout(simHost) {
  const clock = createFakeClock({ start: Date.UTC(2026, 9, 2, 9) })
  const random = createRandom(4)
  const strata = createStrata({
    storage: createMemoryStorage(),
    clock: clock.now,
    random: n => Uint8Array.from({ length: n }, () => random.uint32() & 0xff),
    identity: { id: 'user-1', name: 'Ada' },
    output: () => {},
    simHost,
  })
  for (const bundle of STARTER) strata.components.install(bundle)
  await strata.projects.create('checkout')
  return strata
}

/** The orders service's one endpoint, which inserts each order into the database. */
export const ENDPOINTS = [{ name: 'POST /orders', calls: ['out.insert'] }]

/** `n` orders for the service, 5 ms apart. @param {any} to @param {number} n */
export const orders = (to, n) =>
  Array.from({ length: n }, (_, i) => ({
    to,
    path: '/orders',
    headers: { method: 'POST' },
    body: { table: 'orders', row: { total: 10 + i } },
    atMs: i * 5,
  }))
