/**
 * The subset of semantic versioning Strata needs: parse, compare and caret/tilde/exact ranges.
 */
import { fail } from './errors.js'

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** @param {unknown} version */
export function isSemver(version) {
  return typeof version === 'string' && SEMVER_RE.test(version)
}

/** @param {string} version */
export function parseSemver(version) {
  const m = SEMVER_RE.exec(version)
  if (!m) fail('INVALID', `Not a semantic version: '${version}'`)
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? '' }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive
 */
export function compareSemver(a, b) {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (x.major !== y.major) return x.major - y.major
  if (x.minor !== y.minor) return x.minor - y.minor
  if (x.patch !== y.patch) return x.patch - y.patch
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre < y.pre ? -1 : 1
}

/**
 * Supports exact versions, `^x.y[.z]`, `~x.y[.z]`, `x`, `x.y` and `*`.
 * @param {string} version
 * @param {string} range
 */
export function satisfies(version, range) {
  range = range.trim()
  if (range === '*' || range === '') return true
  const v = parseSemver(version)
  const op = range[0] === '^' || range[0] === '~' ? range[0] : ''
  const parts = range.slice(op.length).split('.')
  if (parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) {
    if (isSemver(range)) return compareSemver(version, range) === 0
    fail('INVALID', `Unsupported version range '${range}'`)
  }
  const [major, minor = 0, patch = 0] = parts.map(Number)
  const floor = `${major}.${minor}.${patch}`
  if (compareSemver(`${v.major}.${v.minor}.${v.patch}`, floor) < 0) return false
  if (op === '^') {
    if (major > 0) return v.major === major
    if (minor > 0 || parts.length < 3) return v.major === 0 && v.minor === minor
    return v.major === 0 && v.minor === 0 && v.patch === patch
  }
  if (op === '~' || parts.length < 3) {
    if (parts.length === 1) return v.major === major
    return v.major === major && v.minor === minor
  }
  return v.major === major && v.minor === minor && v.patch === patch
}
