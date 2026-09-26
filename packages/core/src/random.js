/**
 * Small seeded PRNG (sfc32 seeded through splitmix32). Deterministic across browsers, workers
 * and Node, which the simulation (R1) and reproducible tests rely on.
 */

/** @param {number} seed */
function splitmix32 (seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return (z ^ (z >>> 16)) >>> 0
  }
}

/**
 * Creates a seeded generator.
 * @param {number|string} seed
 */
export function createPrng (seed = 1) {
  const init = splitmix32(typeof seed === 'string' ? hashString(seed) : Number(seed) >>> 0)
  let a = init(); let b = init(); let c = init(); let d = init()
  function nextU32 () {
    const t = (((a + b) >>> 0) + d) >>> 0
    d = (d + 1) >>> 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) >>> 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) >>> 0
    return t
  }
  return {
    nextU32,
    /** Uniform float in [0, 1). */
    next: () => nextU32() / 4294967296,
    /** @param {number} n */
    bytes (n) {
      const out = new Uint8Array(n)
      for (let i = 0; i < n; i++) out[i] = nextU32() & 0xff
      return out
    },
    /**
     * Derives an independent stream, e.g. one per simulated node.
     * @param {string|number} key
     */
    derive: key => createPrng((nextU32() ^ (typeof key === 'string' ? hashString(key) : Number(key))) >>> 0)
  }
}

/** FNV-1a 32-bit hash. @param {string} str */
export function hashString (str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Cryptographically strong random bytes where available. @param {number} n */
export function secureRandomBytes (n) {
  const out = new Uint8Array(n)
  const c = /** @type {any} */ (globalThis).crypto
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(out)
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256)
  return out
}
