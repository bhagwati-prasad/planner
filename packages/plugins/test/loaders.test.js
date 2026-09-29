// Loaders (task 0305, spec §8 "Loading paths"): an upload packs with the same packer as the CLI,
// and uploaded components are kept through the storage port, in memory until M06.
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { main as strataCli } from '../../cli/src/index.js'
import { createMemoryStorage, createStrata } from '../../facade/src/index.js'
import { createFakeClock } from '../../../tools/testing/index.js'
import { packUpload, readBundle } from '../src/index.js'
import { makeZip, messageQueueFolder } from './fixtures.js'

/** @type {string} */
let cwd
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'strata-loaders-'))
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

/** The spec's message queue as the files of a folder named message-queue. */
const queueFiles = () =>
  Object.fromEntries(
    Object.entries(messageQueueFolder()).map(([path, content]) => [
      `message-queue/${path}`,
      content,
    ])
  )

const zipUpload = () => [{ path: 'message-queue.zip', content: makeZip(queueFiles()) }]

describe('upload loader', () => {
  it('packs an uploaded zip of a component folder into the same bundle as strata pack', async () => {
    for (const [path, content] of Object.entries(queueFiles())) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true })
      writeFileSync(join(cwd, path), content)
    }
    const io = { cwd, stdout: { write() {} }, stderr: { write() {} } }
    assert.equal(await strataCli(['pack', 'message-queue'], io), 0)
    const script = readFileSync(join(cwd, 'message-queue/message-queue.strata.js'), 'utf8')

    const uploaded = await packUpload(zipUpload())
    assert.deepEqual(uploaded.bundle, readBundle(script))
    assert.equal(uploaded.script, script, 'the same .strata.js text')
  })

  it('keeps uploaded components through the storage port, so a new session installs them again', async () => {
    const storage = createMemoryStorage()
    const clock = createFakeClock().now
    const first = createStrata({ clock, storage })
    const { component } = await first.components.upload(zipUpload())
    assert.equal(component?.typeRef, 'acme.message-queue@1.2.0')
    // Script tags and the local server bring their components each time; only uploads are kept.
    first.components.register({
      id: 'acme.cache',
      name: 'Cache',
      version: '1.0.0',
      extends: 'base:store',
    })

    const second = createStrata({ clock, storage })
    assert.deepEqual(second.components.versions('acme.message-queue'), [])
    assert.deepEqual(await second.components.restore(), ['acme.message-queue@1.2.0'])
    assert.deepEqual(second.components.versions('acme.message-queue'), ['1.2.0'])
    assert.deepEqual(second.components.versions('acme.cache'), [])

    // Uninstalling forgets the kept copy too.
    second.components.uninstall('acme.message-queue')
    const third = createStrata({ clock, storage })
    assert.deepEqual(await third.components.restore(), [])
  })
})
