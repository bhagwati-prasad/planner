// @ts-check
/**
 * The run hash (eng §13): SHA-256 over the engine version, seed, settings, a hash of the model
 * that ran and a digest of the results, so the same inputs give the same hash in every engine.
 */
import { canonicalJson, sha256, toHex } from '../../core/src/index.js'

/** @param {unknown} value */
const digest = value => toHex(sha256(canonicalJson(value)))

/**
 * @param {{ engine: string, seed: number, settings: object, model: unknown, results: unknown }} run
 * @returns {string} 64 lowercase hex digits
 */
export function runHash({ engine, seed, settings, model, results }) {
  return digest({ engine, seed, settings, model: digest(model), results: digest(results) })
}
