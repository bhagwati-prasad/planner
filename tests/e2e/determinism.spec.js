// @ts-check
// The cross-engine determinism suite (eng §13, §18, task 0429): the recursive fixture's checkout
// run, planned from the model and given the same requests and seed, has the same run hash in
// Node and in each browser's simulation worker (V8, SpiderMonkey and JavaScriptCore), from
// file:// and served. Its services sample lognormal service times and its edges lognormal
// latencies, so the hash covers the in-house log and exp.
import { test, expect } from '../../tools/testing/playwright.js'
import { SIM_PROTOCOL_VERSION, createRegistry, planModel } from '../../packages/core/src/index.js'
import { createInProcessSimHost } from '../../packages/sim/src/index.js'
import { createTestCore } from '../../packages/core/test/helpers.js'
import {
  buildRecursivePayments,
  registerFixtureTypes,
} from '../../tools/fixtures/recursive-payments.js'

/** The checkout run's input: the whole project, with authorisations and refunds at Payments. */
function checkoutRun() {
  const registry = createRegistry()
  registerFixtureTypes(registry)
  const core = createTestCore({ seed: 7, registry })
  const ids = buildRecursivePayments(core)
  for (const [id, median] of [
    [ids.service, 20],
    [ids.ledgerApi, 8],
  ])
    core.dispatch({
      type: 'node.setProps',
      payload: { id, props: { serviceTime: { kind: 'lognormal', median, p99: median * 4 } } },
    })
  const { nodes, edges } = planModel(core)
  const inject = Array.from({ length: 40 }, (_, i) => ({
    node: ids.payments,
    port: 'in',
    method: i % 4 === 3 ? 'refund' : 'authorise',
    body: { order: i, amount: 10 + i },
    atUs: i * 2_500,
  }))
  return { seed: 42, nodes, edges, inject }
}

/**
 * Runs the input to its end through a simulation host and returns its run hash.
 * @param {{ request: (message: any) => Promise<any> }} host @param {object} input
 */
async function runHash(host, input) {
  let id = 0
  /** @param {string} type @param {object} payload */
  const ask = async (type, payload) => {
    const reply = await host.request({ v: SIM_PROTOCOL_VERSION, type, id: ++id, payload })
    if (reply.type === 'error') throw new Error(reply.payload.message)
    return reply.payload
  }
  const { run } = await ask('run.start', { input })
  const end = await ask('run.control', { run, action: 'runToEnd' })
  if (end.status !== 'finished') throw new Error(`the run ended ${end.status}`)
  return (await ask('run.read', { run, what: 'hash' })).data
}

const input = checkoutRun()

test('the recursive fixture’s checkout run has the same hash in Node and in this browser’s worker', async ({
  page,
  urlFor,
}) => {
  const node = await runHash(createInProcessSimHost(), input)
  expect(node).toMatch(/^[0-9a-f]{64}$/)
  await page.goto(urlFor('tests/e2e/fixtures/sim.html'))
  const browser = await page.evaluate(i => /** @type {any} */ (window).runHash(i), input)
  expect(browser).toBe(node)
})
