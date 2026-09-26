// @ts-check
// The walking skeleton's simulation in the browser (task 0009): the worker starts from a Blob
// URL, from file:// and served, and its run hash matches the kernel run in Node.
import { readFileSync } from 'node:fs'
import { test, expect } from '../../tools/testing/playwright.js'
import { simulate } from '../../packages/sim/src/index.js'

const input = JSON.parse(
  readFileSync(
    new URL('../../packages/sim/test/fixtures/skeleton-run.json', import.meta.url),
    'utf8'
  )
)

test('the simulation worker starts from a Blob URL and matches the Node run hash', async ({
  page,
  mode,
  urlFor,
}) => {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await page.goto(urlFor('tests/e2e/fixtures/sim.html'))
  expect(await page.evaluate(() => location.protocol)).toBe(mode === 'file' ? 'file:' : 'http:')
  const run = await page.evaluate(
    payload => /** @type {any} */ (window).runInWorker(payload),
    input
  )
  expect(run.workerUrl).toMatch(/^blob:/)
  expect(run.reply.type).toBe('run.result')
  expect(run.reply.payload.response.atUs).toBe(22_000)
  expect(run.reply.payload.hash).toBe(simulate(input).hash)
  expect(errors).toEqual([])
})
