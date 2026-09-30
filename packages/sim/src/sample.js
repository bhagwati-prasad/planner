// @ts-check
/**
 * Draws from distributions for a run (eng §13 "Cross-engine determinism"): the same uniform
 * number gives the same sample in every engine, because the logarithms and exponentials come
 * from sim's fdlibm ports (math.js) rather than from `Math.log` and `Math.exp`.
 */
import { normalizeDistribution, quantile } from '../../core/src/index.js'
import { exp, log } from './math.js'

/**
 * Inverse of the standard normal CDF (Acklam's approximation, |error| < 1.2e-9).
 * @param {number} p in (0, 1)
 */
export function probit(p) {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  if (p > 0.97575) return -probit(1 - p)
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * log(p)) // IEEE square roots are exact in every engine
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  const q = p - 0.5
  const r = q * q
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

const Z99 = probit(0.99)
/** A uniform number in [0, 1) moved off 0, where the normal quantile is infinite. */
const open = (/** @type {number} */ u) => u || 2 ** -33

/**
 * A sample of a distribution for a uniform number in [0, 1).
 * @param {unknown} dist  a distribution in any form core's normalizeDistribution accepts
 * @param {number} u
 */
export function sample(dist, u) {
  const d = normalizeDistribution(dist)
  switch (d.kind) {
    case 'normal':
      return d.mean + d.sd * probit(open(u))
    case 'exponential':
      return -d.mean * log(1 - u)
    case 'lognormal': {
      const mu = log(d.median)
      const sigma = (log(d.p99) - mu) / Z99
      return exp(mu + sigma * probit(open(u)))
    }
    default:
      // constant, uniform and empirical need no logarithm or exponential
      return quantile(d, u)
  }
}
