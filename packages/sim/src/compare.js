// @ts-check
/**
 * Run comparison (spec §12 "Run tree", task 0415): two runs, branches included, side by side at
 * the same moment. Metrics compare by component and name: how many values each run reported,
 * their sum and the last. State compares field by field, down to the values that differ.
 */

/**
 * @typedef {{ count: number, sum: number, last: number|null }} MetricSummary
 * @typedef {{ node: string, name: string, a: MetricSummary, b: MetricSummary }} MetricDifference
 * @typedef {{ node: string, path: (string|number)[], a: unknown, b: unknown }} StateDifference
 */

/** The metrics a run reported, summed by component and name. @param {import('./run.js').Run} run */
function summary(run) {
  /** @type {Map<string, MetricSummary & { node: string, name: string }>} */
  const out = new Map()
  for (const { node, name, value } of run.metrics) {
    const key = `${node}\u0000${name}`
    const s = out.get(key) ?? { node, name, count: 0, sum: 0, last: null }
    s.count++
    s.sum += value
    s.last = value
    out.set(key, s)
  }
  return out
}

/**
 * Where two values differ, as paths from `path`.
 * @param {unknown} a @param {unknown} b @param {(string|number)[]} path
 * @returns {{ path: (string|number)[], a: unknown, b: unknown }[]}
 */
function differences(a, b, path = []) {
  const object = (/** @type {unknown} */ v) => v !== null && typeof v === 'object'
  if (object(a) && object(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a)
      ? Array.from({ length: Math.max(a.length, /** @type {unknown[]} */ (b).length) }, (_, i) => i)
      : [
          ...new Set([
            ...Object.keys(/** @type {object} */ (a)),
            ...Object.keys(/** @type {object} */ (b)),
          ]),
        ].sort()
    return keys.flatMap(k =>
      differences(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k], [...path, k])
    )
  }
  return Object.is(a, b) ? [] : [{ path, a, b }]
}

/**
 * Moves two runs to the same moment and returns how they differ there: in the metrics each
 * component reported so far, and in each component's state.
 * @param {import('./run.js').Run} a @param {import('./run.js').Run} b
 * @param {{ event?: number, timeUs?: number }} moment
 * @returns {Promise<{ metrics: MetricDifference[], state: StateDifference[] }>}
 */
export async function compareRuns(a, b, moment) {
  await a.seek(moment)
  await b.seek(moment)
  const [ma, mb] = [summary(a), summary(b)]
  const none = { count: 0, sum: 0, last: null }
  /** @type {MetricDifference[]} */
  const metrics = []
  for (const key of [...new Set([...ma.keys(), ...mb.keys()])].sort()) {
    const [x, y] = [ma.get(key), mb.get(key)]
    const node = /** @type {any} */ (x ?? y).node
    const name = /** @type {any} */ (x ?? y).name
    const [sa, sb] = [x ?? { node, name, ...none }, y ?? { node, name, ...none }]
    if (sa.count !== sb.count || sa.sum !== sb.sum || sa.last !== sb.last)
      metrics.push({
        node,
        name,
        a: { count: sa.count, sum: sa.sum, last: sa.last },
        b: { count: sb.count, sum: sb.sum, last: sb.last },
      })
  }
  const nodes = [...new Set([...a.components, ...b.components])].sort()
  const state = nodes.flatMap(node =>
    differences(a.stateOf(node), b.stateOf(node)).map(d => ({ node, ...d }))
  )
  return { metrics, state }
}
