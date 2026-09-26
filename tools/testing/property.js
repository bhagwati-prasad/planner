// @ts-check
// property(): checks that a predicate holds for generated cases (eng §18). On failure it shrinks
// the case to a small counterexample and reports the seed, so the failure can be replayed with
// STRATA_SEED=<seed>. The default seed is fixed, so test runs are reproducible.
import { createRandom, gen } from './gen.js'

const DEFAULT_SEED = 0x5eed

export class PropertyFailure extends Error {
  /**
   * @param {string} message
   * @param {{ seed: number|string, counterexample: unknown[], original: unknown[], run: number, shrinks: number, cause: unknown }} details
   */
  constructor(message, details) {
    super(message, { cause: details.cause })
    this.name = 'PropertyFailure'
    this.seed = details.seed
    this.counterexample = details.counterexample
    this.original = details.original
    this.run = details.run
    this.shrinks = details.shrinks
  }
}

/** @param {unknown} value */
const show = value => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? `${v}n` : v))

/**
 * Runs `predicate` on `runs` generated cases. It fails when the predicate returns false or throws.
 * @param {import('./gen.js').Generator<any>[]} generators one per predicate argument
 * @param {(...args: any[]) => unknown} predicate
 * @param {{ seed?: number|string, runs?: number, maxShrinks?: number }} [options]
 */
export function property(generators, predicate, options = {}) {
  const env = globalThis.process?.env?.STRATA_SEED
  const seed =
    options.seed ?? (env ? (Number.isFinite(Number(env)) ? Number(env) : env) : DEFAULT_SEED)
  const { runs = 100, maxShrinks = 2000 } = options
  const random = createRandom(seed)
  const cases = gen.tuple(...generators)

  /** @param {unknown[]} args @returns {unknown} the failure, or undefined */
  const failure = args => {
    try {
      return predicate(...args) === false ? new Error('The predicate returned false') : undefined
    } catch (err) {
      return err
    }
  }

  for (let run = 1; run <= runs; run++) {
    const original = cases.generate(random)
    let cause = failure(original.value)
    if (cause === undefined) continue
    let current = original
    let shrinks = 0
    let attempts = 0
    for (let smaller = true; smaller && attempts < maxShrinks;) {
      smaller = false
      for (const child of current.children()) {
        if (++attempts > maxShrinks) break
        const childCause = failure(child.value)
        if (childCause === undefined) continue
        current = child
        cause = childCause
        shrinks++
        smaller = true
        break
      }
    }
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new PropertyFailure(
      [
        `Property failed on run ${run} of ${runs} (seed ${seed}; rerun with STRATA_SEED=${seed}).`,
        `Counterexample (shrunk in ${shrinks} steps): ${show(current.value)}`,
        `Original: ${show(original.value)}`,
        reason,
      ].join('\n'),
      { seed, counterexample: current.value, original: original.value, run, shrinks, cause }
    )
  }
}
