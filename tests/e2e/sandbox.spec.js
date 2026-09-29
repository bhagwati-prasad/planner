// @ts-check
// The simulation worker's sandbox in the browser (task 0402, spec §8 "Sandbox"): started from a
// Blob URL, from file:// and served under the strict CSP, it strips network and storage globals,
// removes importScripts once components have loaded, and makes Math.random seeded and the clock
// simulated. The watchdog is tested in Node with a fake scheduler (packages/sim/test/host.test.js).
import { readFileSync, readdirSync } from 'node:fs'
import { test, expect } from '../../tools/testing/playwright.js'
import { PROTOCOL_VERSION as V, createStreams } from '../../packages/sim/src/index.js'
import { behaviourScript, packComponent } from '../../packages/plugins/src/index.js'

const PROBE = 'test.probe@1.0.0'
const dir = new URL('../../packages/sim/test/fixtures/sandbox-probe/', import.meta.url)
const { bundle } = packComponent(
  Object.fromEntries(
    readdirSync(dir).map(name => [name, readFileSync(new URL(name, dir), 'utf8')])
  ),
  { name: 'sandbox-probe' }
)
if (!bundle) throw new Error('The sandbox probe does not pack')
const load = { v: V, type: 'load', id: 1, payload: { scripts: [behaviourScript(bundle)] } }
/** @param {string} method @param {object} [extra] */
const call = (method, extra = {}) => ({
  v: V,
  type: 'call',
  id: 2,
  payload: { component: PROBE, node: 'probe-1', method, input: {}, seed: 7, atUs: 0, ...extra },
})

/**
 * Posts messages to a fresh worker on the sandbox page and returns the replies.
 * @param {import('@playwright/test').Page} page
 * @param {(url: string) => string} urlFor
 * @param {object[]} messages
 * @returns {Promise<any[]>}
 */
async function inSandbox(page, urlFor, messages) {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await page.goto(urlFor('tests/e2e/fixtures/sandbox.html'))
  const replies = await page.evaluate(m => /** @type {any} */ (window).inSandbox(m), messages)
  expect(errors).toEqual([])
  return replies
}

test('the worker strips network and storage globals, and importScripts once components load', async ({
  page,
  urlFor,
}) => {
  const [loaded, globals] = await inSandbox(page, urlFor, [load, call('globals')])
  expect(loaded).toMatchObject({ type: 'load.result', payload: { components: [PROBE] } })
  expect(globals.type).toBe('call.result')
  expect(globals.payload.output).toEqual({
    fetch: 'undefined',
    XMLHttpRequest: 'undefined',
    WebSocket: 'undefined',
    EventSource: 'undefined',
    indexedDB: 'undefined',
    caches: 'undefined',
    importScripts: 'undefined',
  })
})

test('Math.random is seeded, and Date.now and performance.now are simulated time', async ({
  page,
  urlFor,
}) => {
  const stream = createStreams(7).stream('probe-1')
  const [, clock] = await inSandbox(page, urlFor, [load, call('clock', { atUs: 1_500_000 })])
  expect(clock.payload.output).toEqual({
    random: [stream.nextU32() / 2 ** 32, stream.nextU32() / 2 ** 32],
    dateNow: 1500,
    performanceNow: 1500,
  })
})

test('a message with an unknown protocol version is refused', async ({ page, urlFor }) => {
  const [reply] = await inSandbox(page, urlFor, [{ ...load, v: V + 1 }])
  expect(reply).toMatchObject({ v: V, type: 'error', payload: { code: 'E_PROTOCOL_VERSION' } })
})
