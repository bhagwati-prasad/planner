// @ts-check
// Seeded generators for property tests (eng §18). Each generator produces a lazy shrink tree:
// a value plus the smaller values to try when a property fails. Composites (array, record,
// tuple, map) build their trees from their parts, so everything shrinks without extra code.

/**
 * @template T
 * @typedef {{ value: T, children: () => Iterable<Tree<T>> }} Tree
 */
/**
 * @template T
 * @typedef {{ generate: (random: Random) => Tree<T> }} Generator
 */
/**
 * @typedef {object} Random
 * @property {() => number} uint32  a uniform 32-bit unsigned integer
 * @property {() => number} float   a uniform number in [0, 1)
 */

/** @param {number|string} seed */
function seedWord(seed) {
  if (typeof seed === 'number') return seed >>> 0
  let h = 2166136261
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/**
 * A seeded PRNG (sfc32, seeded through splitmix32). The same seed gives the same sequence on
 * every JavaScript engine.
 * @param {number|string} seed
 * @returns {Random}
 */
export function createRandom(seed) {
  let s = seedWord(seed)
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
  let a = split()
  let b = split()
  let c = split()
  let d = split()
  const uint32 = () => {
    const t = (((a + b) >>> 0) + d) >>> 0
    d = (d + 1) >>> 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) >>> 0
    c = ((c << 21) | (c >>> 11)) >>> 0
    c = (c + t) >>> 0
    return t
  }
  return { uint32, float: () => uint32() / 4294967296 }
}

/** @template T @param {T} value @param {() => Iterable<Tree<T>>} [children] @returns {Tree<T>} */
const tree = (value, children = () => []) => ({ value, children })

/** Integers from `target` towards `v`: target, then halving the distance. */
function* towards(v, target) {
  if (v === target) return
  yield target
  let d = v - target
  for (d = Math.trunc(d / 2); d !== 0; d = Math.trunc(d / 2)) yield v - d
}

/** @param {number} v @param {number} target @returns {Tree<number>} */
const intTree = (v, target) =>
  tree(v, function* () {
    for (const c of towards(v, target)) yield intTree(c, target)
  })

/**
 * @template T
 * @param {Tree<T>[]} trees
 * @param {number} min
 * @returns {Tree<T[]>}
 */
function arrayTree(trees, min) {
  return tree(
    trees.map(t => t.value),
    function* () {
      const n = trees.length
      // Remove chunks, largest first, then shrink the elements one by one.
      for (let k = n - min; k >= 1; k = k === 1 ? 0 : Math.floor(k / 2)) {
        for (let i = 0; i + k <= n; i += k)
          yield arrayTree([...trees.slice(0, i), ...trees.slice(i + k)], min)
      }
      for (let i = 0; i < n; i++) {
        for (const child of trees[i].children())
          yield arrayTree([...trees.slice(0, i), child, ...trees.slice(i + 1)], min)
      }
    }
  )
}

/**
 * @param {Record<string, Tree<any>>} trees
 * @returns {Tree<Record<string, any>>}
 */
function recordTree(trees) {
  const value = Object.fromEntries(Object.entries(trees).map(([k, t]) => [k, t.value]))
  return tree(value, function* () {
    for (const [key, t] of Object.entries(trees)) {
      for (const child of t.children()) yield recordTree({ ...trees, [key]: child })
    }
  })
}

/** @template T, U @param {Tree<T>} t @param {(value: T) => U} f @returns {Tree<U>} */
const mapTree = (t, f) =>
  tree(f(t.value), function* () {
    for (const c of t.children()) yield mapTree(c, f)
  })

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789 '

export const gen = {
  /** Integers in [min, max], shrinking towards 0 (or the bound nearest to it). */
  int(min = -1000, max = 1000) {
    const target = Math.min(Math.max(0, min), max)
    return {
      generate: (/** @type {Random} */ r) =>
        intTree(min + Math.floor(r.float() * (max - min + 1)), target),
    }
  },
  /** Numbers in [min, max), shrinking towards the bound nearest to 0. */
  float(min = 0, max = 1) {
    const target = Math.min(Math.max(0, min), max)
    const floatTree = (/** @type {number} */ v, depth = 0) =>
      tree(v, function* () {
        if (v === target || depth > 12) return
        yield floatTree(target, depth + 1)
        yield floatTree(v - (v - target) / 2, depth + 1)
      })
    return { generate: (/** @type {Random} */ r) => floatTree(min + r.float() * (max - min)) }
  },
  /** true or false, shrinking to false. */
  bool() {
    return {
      generate: (/** @type {Random} */ r) =>
        r.float() < 0.5 ? tree(false) : tree(true, () => [tree(false)]),
    }
  },
  /** One of the given values, shrinking towards the first. @param {...any} values */
  oneOf(...values) {
    const at = (/** @type {number} */ i) =>
      tree(values[i], function* () {
        for (let j = 0; j < i; j++) yield at(j)
      })
    return { generate: (/** @type {Random} */ r) => at(Math.floor(r.float() * values.length)) }
  },
  /**
   * Arrays of `item`, shrinking by removing elements, then by shrinking them.
   * @param {Generator<any>} item
   * @param {{ min?: number, max?: number }} [options]
   */
  array(item, { min = 0, max = 16 } = {}) {
    return {
      generate: (/** @type {Random} */ r) => {
        const length = min + Math.floor(r.float() * (max - min + 1))
        return arrayTree(
          Array.from({ length }, () => item.generate(r)),
          min
        )
      },
    }
  },
  /** Strings from an alphabet, shrinking like arrays of characters. @param {{ min?: number, max?: number, alphabet?: string }} [options] */
  string({ min = 0, max = 16, alphabet = ALPHABET } = {}) {
    return gen.map(gen.array(gen.oneOf(...alphabet), { min, max }), chars => chars.join(''))
  },
  /** Objects with a generator per key. @param {Record<string, Generator<any>>} shape */
  record(shape) {
    return {
      generate: (/** @type {Random} */ r) =>
        recordTree(Object.fromEntries(Object.entries(shape).map(([k, g]) => [k, g.generate(r)]))),
    }
  },
  /** Fixed-length arrays with a generator per position. @param {...Generator<any>} items */
  tuple(...items) {
    return {
      generate: (/** @type {Random} */ r) =>
        mapTree(recordTree(Object.fromEntries(items.map((g, i) => [i, g.generate(r)]))), v =>
          items.map((_, i) => v[i])
        ),
    }
  },
  /** Transforms generated values; shrinking happens on the source. @param {Generator<any>} source @param {(value: any) => any} f */
  map(source, f) {
    return { generate: (/** @type {Random} */ r) => mapTree(source.generate(r), f) }
  },
}

/**
 * Values from a generator, for inspecting what it produces.
 * @template T
 * @param {Generator<T>} generator
 * @param {{ seed?: number|string, count?: number }} [options]
 * @returns {T[]}
 */
export function sample(generator, { seed = 1, count = 10 } = {}) {
  const random = createRandom(seed)
  return Array.from({ length: count }, () => generator.generate(random).value)
}
