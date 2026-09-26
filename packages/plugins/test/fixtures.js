// Shared fixtures for the strata-plugins tests.
import { deflateRawSync } from 'node:zlib'
import { createModuleRuntime } from '../src/bundle.js'

/** The component folder from spec §7, with a helper module, docs, a template and self-tests. */
export function messageQueueFolder() {
  return {
    'manifest.json': JSON.stringify(
      {
        strataApi: '^1.0',
        id: 'acme.message-queue',
        name: 'Message Queue',
        version: '1.2.0',
        category: 'Messaging',
        icon: 'icon.svg',
        entry: 'index.js',
        extends: 'base:queue',
        ports: [
          { name: 'in', direction: 'in', accepts: ['async-message'] },
          { name: 'out', direction: 'out', accepts: ['async-message'] },
          { name: 'dlq', direction: 'out', accepts: ['async-message'] },
        ],
        properties: {
          capacity: {
            type: 'integer',
            unit: 'messages',
            default: 100000,
            min: 1,
            group: 'Capacity',
            rollup: 'sum',
          },
          retention: { type: 'duration', default: '4d', group: 'Durability' },
          deliveryDelay: {
            type: 'distribution',
            unit: 'ms',
            default: { kind: 'lognormal', median: 5, p99: 40 },
          },
          overflowPolicy: {
            type: 'enum',
            values: ['reject', 'drop-oldest', 'block'],
            default: 'reject',
          },
        },
        metrics: {
          depth: { unit: 'messages', rollup: 'sum' },
          oldestAge: { unit: 's', rollup: 'max' },
        },
        templates: { docs: ['templates/runbook.md'] },
      },
      null,
      2
    ),
    'icon.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>',
    'index.js': `// Behaviour of the message queue (runs in the simulation worker).
import { backoff } from './lib/backoff.js'
import defaults from './lib/defaults.json' with { type: 'json' }

export default {
  init (ctx) {
    ctx.state.items = []
  },
  onMessage (msg, ctx) {
    if (ctx.state.items.length >= ctx.props.capacity) return ctx.reject(msg, 'QUEUE_FULL')
    ctx.state.items.push({ msg, at: ctx.now })
    ctx.metric('depth', ctx.state.items.length)
    ctx.schedule(backoff(ctx.state.items.length, defaults.baseDelay), 'deliver')
  },
  onTimer (name, ctx) {
    if (name === 'deliver') ctx.send('out', ctx.state.items.shift().msg)
  }
}
`,
    'lib/backoff.js': `/** Exponential backoff with a cap. */
export function backoff (attempt, base = 10) {
  return Math.min(base * 2 ** attempt, 30000)
}
`,
    'lib/defaults.json': '{ "baseDelay": 5 }',
    'lib/unused.js': 'export const nothing = 1\n',
    'README.md': '# Message Queue\n\nBuffers messages between producers and consumers.\n',
    'templates/runbook.md': '# Runbook: {{name}}\n',
    'tests/queue.test.js': 'import q from "../index.js"\n',
    '.DS_Store': new Uint8Array([0, 1, 2, 3]),
  }
}

/**
 * Evaluates wrapped modules (as a worker would) and loads `entry`.
 * @param {Record<string, string>} modules path → wrapped source
 * @param {string} entry
 */
export function loadModules(modules, entry) {
  // eslint-disable-next-line no-new-func
  const defs = new Function(
    `return {${Object.entries(modules)
      .map(([p, src]) => `${JSON.stringify(p)}: ${src}`)
      .join(',\n')}}`
  )()
  return createModuleRuntime(defs).load(entry)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Writes a zip archive (stored or deflated entries).
 * @param {Record<string, string|Uint8Array>} files
 * @param {{ deflate?: boolean, flags?: number }} [options]
 */
export function makeZip(files, { deflate = true, flags = 0x800 } = {}) {
  const enc = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const raw = typeof content === 'string' ? enc.encode(content) : content
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw
    const nameBytes = enc.encode(name)
    const crc = crc32(raw)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, flags, true)
    lv.setUint16(8, deflate ? 8 : 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, flags, true)
    cv.setUint16(10, deflate ? 8 : 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p)
    p += part.length
  }
  return out
}
