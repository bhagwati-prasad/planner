// @ts-check
/**
 * The debugger (spec §13, task 0416) over a run's controls: breakpoints on calls, arrivals,
 * departures, edges and named logs; hop inspection, with each hop's differences from the one
 * before; the followed request's method stack; component state; and effective properties with
 * the source of each value.
 */
import { defaultProps, fail, normalizeManifest } from '../../core/src/index.js'

/**
 * @typedef {import('../../sim/src/index.js').RunControl} RunControl
 * @typedef {import('../../sim/src/run.js').Happening} Happening
 * @typedef {import('../../sim/src/run.js').Hop} Hop
 * @typedef {import('../../sim/src/run.js').Span} Span
 *
 * A breakpoint (spec §13): a public or private method call starting; a message arriving at a
 * component, or leaving one; a message on an edge; or a log whose first argument is `name`.
 * @typedef {{ on: 'call', node: string, method?: string, kind?: 'public'|'private' }
 *   | { on: 'arrive', node: string, method?: string }
 *   | { on: 'depart', node: string, port?: string }
 *   | { on: 'edge', edge: string }
 *   | { on: 'log', name: string, node?: string }
 *   | { on: 'fault' }} BreakpointSpec
 *
 * @typedef {{ field: string, a: unknown, b: unknown }} HopDifference
 * @typedef {Hop & { sinceUs: number, diff: HopDifference[] }} InspectedHop
 */

/** The meta fields a hop compares, in order, before its headers and body. */
const META = /** @type {const} */ ([
  'node',
  'port',
  'method',
  'path',
  'kind',
  'sizeBytes',
  'attempt',
])

/**
 * Where two values differ, as dotted paths under `prefix`.
 * @param {unknown} a @param {unknown} b @param {string} prefix
 * @returns {HopDifference[]}
 */
function differences(a, b, prefix) {
  const object = (/** @type {unknown} */ v) => v !== null && typeof v === 'object'
  if (object(a) || object(b)) {
    const x = /** @type {any} */ (object(a) ? a : {})
    const y = /** @type {any} */ (object(b) ? b : {})
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()
    return keys.flatMap(k => differences(x[k], y[k], `${prefix}.${k}`))
  }
  return Object.is(a, b) ? [] : [{ field: prefix, a, b }]
}

/**
 * Whether a happening matches a breakpoint.
 * @param {BreakpointSpec} spec
 * @returns {(h: Happening) => boolean}
 */
function matcher(spec) {
  switch (spec.on) {
    case 'call':
      return h =>
        h.type === 'call' &&
        h.node === spec.node &&
        (spec.method === undefined || h.method === spec.method) &&
        (spec.kind === undefined || h.kind === spec.kind)
    case 'arrive':
      return h =>
        h.type === 'arrive' &&
        h.node === spec.node &&
        (spec.method === undefined || h.method === spec.method)
    case 'depart':
      return h =>
        h.type === 'depart' &&
        h.node === spec.node &&
        (spec.port === undefined || h.port === spec.port)
    case 'edge':
      return h => h.type === 'depart' && h.edge === spec.edge
    case 'log':
      return h =>
        h.type === 'log' &&
        (spec.node === undefined || h.node === spec.node) &&
        String(h.args[0]) === spec.name
    case 'fault':
      return fail('INVALID', 'Fault breakpoints come with chaos faults (R1)')
    default:
      return fail(
        'INVALID',
        `Breakpoints are on call, arrive, depart, edge or log, not '${/** @type {any} */ (spec).on}'`
      )
  }
}

export class Debugger {
  #control

  /** @param {RunControl} control */
  constructor(control) {
    this.#control = control
  }

  /** Pauses before the event in which something the breakpoint names happens. @param {BreakpointSpec} spec */
  setBreakpoint(spec) {
    this.#control.setBreakpoint({ when: matcher(spec) })
  }

  clearBreakpoints() {
    this.#control.clearBreakpoints()
  }

  /**
   * The hops of a request, the followed one by default: each message as it arrived, how long
   * after the hop before, and how it differs from it, in its meta fields, headers and body. The
   * run must inspect (`inspect: true`).
   * @param {string|null} [trace]
   * @returns {InspectedHop[]}
   */
  hops(trace = this.#control.following) {
    const all =
      this.#control.run.messages ?? fail('INVALID', 'Hop inspection needs a run with inspect: true')
    const mine = all.filter(h => h.traceId === trace)
    return mine.map((hop, i) => {
      const before = mine[i - 1]
      if (!before) return { ...hop, sinceUs: 0, diff: [] }
      const diff = [
        ...META.flatMap(field =>
          Object.is(before[field], hop[field]) ? [] : [{ field, a: before[field], b: hop[field] }]
        ),
        ...differences(before.headers, hop.headers, 'headers'),
        ...differences(before.body, hop.body, 'body'),
      ]
      return { ...hop, sinceUs: hop.atUs - before.atUs, diff }
    })
  }

  /**
   * The followed request's active calls, outermost first: each public or private call still
   * running, by the chain of calls that made it.
   * @returns {Span[]}
   */
  methodStack() {
    const trace = this.#control.following
    if (!trace) return []
    const spans = this.#control.run.spans
    const byId = new Map(spans.map(s => [s.spanId, s]))
    /** @param {Span} span */
    const depth = span => {
      let n = 0
      for (let at = byId.get(span.parentSpanId ?? ''); at; at = byId.get(at.parentSpanId ?? '')) n++
      return n
    }
    return spans
      .filter(
        s =>
          s.traceId === trace &&
          s.status === 'running' &&
          (s.kind === 'public' || s.kind === 'private')
      )
      .sort((a, b) => depth(a) - depth(b))
  }

  /** A copy of a component's state now. @param {string} node */
  state(node) {
    return this.#control.run.stateOf(node)
  }

  /**
   * Every property value of a component, with its source: its manifest's default, an override
   * the model gave it, or a run-only change.
   * @param {string} node
   * @returns {Record<string, { value: unknown, source: 'default'|'override'|'run-only' }>}
   */
  effectiveProps(node) {
    const run = this.#control.run
    const input = run.inputOf(node)
    const defaults = input
      ? defaultProps(/** @type {any} */ (normalizeManifest(input.manifest)).properties ?? {})
      : {}
    const changed = new Set(
      run.appliedEdits.flatMap(({ edit }) =>
        edit.kind === 'props' && edit.node === node ? Object.keys(edit.props) : []
      )
    )
    const props = run.propsOf(node) ?? {}
    return Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        {
          value,
          source: changed.has(key)
            ? 'run-only'
            : input?.props && key in input.props
              ? 'override'
              : key in defaults
                ? 'default'
                : 'override',
        },
      ])
    )
  }
}

/**
 * A debugger over a run's controls (spec §13).
 * @param {RunControl} control
 * @example const debug = createDebugger(control); debug.setBreakpoint({ on: 'call', node: 'svc', method: 'check' })
 */
export function createDebugger(control) {
  return new Debugger(control)
}
