// @ts-check
// The offline build (spec §4 "Build", task 0418): simulation code ships only in the worker
// bundle, which has its own eng §15 line, so the app's main-thread bundle carries none of it.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SIM_WORKER_ENTRY, bundledModules } from '../../scripts/build.js'

describe('offline build', () => {
  it('carries no strata-sim module in the main-thread app bundle, and all of the worker in its own', async () => {
    const app = await bundledModules('app/offline.js')
    assert.ok(app.includes('packages/facade/src/index.js'), 'the app bundle is measured')
    assert.deepEqual(
      app.filter(path => path.startsWith('packages/sim/')),
      [],
      'the page reaches the simulator only through its worker host'
    )
    const worker = await bundledModules(SIM_WORKER_ENTRY)
    assert.ok(worker.includes('packages/sim/src/kernel.js'))
  })
})
