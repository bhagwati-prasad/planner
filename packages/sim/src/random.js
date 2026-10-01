// @ts-check
/**
 * Seeded randomness for runs (eng §13 "Randomness"): one xoshiro128** stream per key (a
 * component id), seeded through splitmix32 from the run seed combined with a hash of the key,
 * so adding a component never changes another component's stream. Integer arithmetic only,
 * so every engine produces the same numbers.
 */

/** 32-bit FNV-1a of a string's UTF-16 code units. @param {string} text */
export function hashKey(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** @param {number} seed */
function splitmix32(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
}

/**
 * A generator, whose position `save` returns and `load` puts back (task 0413).
 * @typedef {{ nextU32: () => number, save: () => number[], load: (saved: number[]) => void }} Stream
 */

/** @param {number} x @param {number} k */
const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0

/**
 * A xoshiro128** generator.
 * @param {number} seed 32-bit seed, expanded through splitmix32
 * @returns {Stream}
 */
export function xoshiro128ss(seed) {
  const init = splitmix32(seed)
  let a = init()
  let b = init()
  let c = init()
  let d = init()
  if ((a | b | c | d) === 0) a = 1
  return {
    nextU32() {
      const result = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0
      const t = (b << 9) >>> 0
      c ^= a
      d ^= b
      b ^= c
      a ^= d
      c ^= t
      d = rotl(d >>> 0, 11)
      a >>>= 0
      b >>>= 0
      c >>>= 0
      return result
    },
    save: () => [a, b, c, d],
    load(/** @type {number[]} */ saved) {
      ;[a, b, c, d] = saved
    },
  }
}

/**
 * The streams of one run: `stream(key)` returns the same generator for the same key.
 * @param {number} seed the run seed
 */
export function createStreams(seed) {
  /** @type {Map<string, Stream>} */
  const streams = new Map()
  return {
    /** @param {string} key */
    stream(key) {
      let stream = streams.get(key)
      if (!stream) {
        stream = xoshiro128ss((seed ^ hashKey(key)) >>> 0)
        streams.set(key, stream)
      }
      return stream
    },
  }
}

/**
 * `words` random 32-bit words as lowercase hex, for trace and span ids.
 * @param {{ nextU32: () => number }} stream
 * @param {number} words
 */
export function hexId(stream, words) {
  let out = ''
  for (let i = 0; i < words; i++) out += stream.nextU32().toString(16).padStart(8, '0')
  return out
}
