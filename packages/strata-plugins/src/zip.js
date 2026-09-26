/**
 * A small zip reader for component uploads (spec §7 "Loading paths": "Drop a zip or
 * .strata.js in the library panel"). It reads the central directory, supports stored and
 * deflated entries, and refuses encrypted, ZIP64 and oversized archives.
 *
 * Inflation is injected: browsers and Node 21+ have `DecompressionStream('deflate-raw')`
 * (the default); the CLI passes Node's zlib.
 */
import { StrataError } from '../../strata-core/src/index.js'

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const LIMITS = { entries: 2000, bytes: 64 * 1024 * 1024 }

/**
 * @callback InflateRaw
 * @param {Uint8Array} data  raw deflate stream
 * @returns {Promise<Uint8Array>|Uint8Array}
 */

/** @param {Uint8Array} data @returns {Promise<Uint8Array>} */
async function streamInflate (data) {
  if (typeof DecompressionStream !== 'function') throw new StrataError('UNSUPPORTED', 'This environment cannot decompress zip files; unzip the folder and upload its files instead')
  const stream = new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * @param {Uint8Array} bytes
 * @param {{ inflateRaw?: InflateRaw }} [options]
 * @returns {Promise<Record<string, Uint8Array>>} path → content (directories omitted)
 */
export async function readZip (bytes, { inflateRaw = streamInflate } = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const bad = message => new StrataError('INVALID', `Not a readable zip file: ${message}`)

  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw bad('no end of central directory record')
  const count = view.getUint16(eocd + 10, true)
  const size = view.getUint32(eocd + 12, true)
  const offset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw bad('ZIP64 archives are not supported')
  if (count > LIMITS.entries) throw bad(`it has ${count} entries (at most ${LIMITS.entries})`)
  if (offset + size > bytes.length) throw bad('the central directory lies outside the file')

  const utf8 = new TextDecoder('utf-8')
  const latin1 = new TextDecoder('latin1')
  /** @type {Record<string, Uint8Array>} */
  const out = {}
  let total = 0
  let p = offset
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CENTRAL) throw bad('corrupt central directory')
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const compressed = view.getUint32(p + 20, true)
    const uncompressed = view.getUint32(p + 24, true)
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const rawName = bytes.subarray(p + 46, p + 46 + nameLength)
    const name = (flags & 0x800 ? utf8 : latin1).decode(rawName)
    p += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue
    if (flags & 1) throw bad(`'${name}' is encrypted`)
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) throw bad('ZIP64 archives are not supported')
    total += uncompressed
    if (total > LIMITS.bytes) throw bad(`it expands to more than ${LIMITS.bytes / 1048576} MB`)
    if (view.getUint32(localOffset, true) !== LOCAL) throw bad(`corrupt entry '${name}'`)
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const data = bytes.subarray(start, start + compressed)
    let content
    if (method === 0) content = data.slice()
    else if (method === 8) content = await inflateRaw(data)
    else throw bad(`'${name}' uses compression method ${method}; use the standard deflate`)
    if (content.length !== uncompressed) throw bad(`'${name}' has the wrong size after decompression`)
    out[name] = content
  }
  return out
}

/** True when the bytes start like a zip file. @param {Uint8Array} bytes */
export function isZip (bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
}
