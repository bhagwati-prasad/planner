// @ts-check
/**
 * Routing rules (spec §11 "Routing and resources", ADR 0019). An edge's `route` property lists
 * rules: `method getOrder, listOrders`, `path /orders` (a prefix, by whole segments),
 * `header x-canary = 1` (names in any case), `weight 30` and `when <expression>`. An edge's
 * `method` (ADR 0011) is a method rule too. A message leaving a port can travel on the edges
 * whose rules all hold; edges with conditions beat edges with none, and a draw weighted by
 * their weights picks among several.
 */
import { StrataError } from '../../core/src/index.js'
import { compile } from './expr.js'

/**
 * @typedef {object} Route
 * @property {((msg: any) => boolean)[]} conditions  what a message must meet to travel on it
 * @property {number} weight  its share of the messages it may carry with other edges
 */

/**
 * A header's value, whatever the case of its name.
 * @param {unknown} headers @param {string} name  in lower case
 */
function header(headers, name) {
  for (const [key, value] of Object.entries(headers ?? {}))
    if (key.toLowerCase() === name) return String(value)
}

/**
 * How each rule turns its value into a condition on messages.
 * @type {Record<string, (value: string, bad: (why: string) => never) => (msg: any) => boolean>}
 */
const CONDITIONS = {
  method(value) {
    const names = value.split(/[\s,]+/).filter(Boolean)
    return msg => names.includes(msg.method)
  },
  path(value) {
    const prefix = value.replace(/\/+$/, '')
    return msg =>
      typeof msg.path === 'string' && (msg.path === prefix || msg.path.startsWith(`${prefix}/`))
  },
  header(value, bad) {
    const [, name, expected] =
      /^([^\s=]+)\s*=\s*(.*)$/s.exec(value) ?? bad("must read 'header <name> = <value>'")
    const lower = name.toLowerCase()
    return msg => header(msg.headers, lower) === expected
  },
  when(value, bad) {
    /** @type {import('./expr.js').Evaluate} */
    let test
    try {
      test = compile(value, ['msg'])
    } catch (err) {
      bad(`has an invalid expression: ${/** @type {Error} */ (err).message}`)
    }
    return msg => Boolean(test({ msg }))
  },
}

/**
 * An edge's route, read from its method and `route` rules.
 * @param {{ id: string, method?: string|null, props?: { route?: unknown } }} edge
 * @returns {Route}
 */
export function parseRoute({ id, method, props }) {
  /** @type {Route['conditions']} */
  const conditions = method ? [msg => msg.method === method] : []
  let weight = 1
  for (const rule of /** @type {string[]} */ (props?.route ?? [])) {
    /** @param {string} why @returns {never} */
    const bad = why => {
      throw new StrataError('E_SIM_ROUTE_INVALID', `Edge ${id}: the rule '${rule}' ${why}`)
    }
    const [, word, value] = /^\s*(\S*)\s*(.*?)\s*$/s.exec(String(rule)) ?? ['', '', '']
    if (word !== 'weight' && !Object.hasOwn(CONDITIONS, word))
      bad('must start with method, path, header, weight or when')
    if (!value) bad(`needs a value after '${word}'`)
    if (word === 'weight') weight = Number(value)
    else conditions.push(CONDITIONS[word](value, bad))
    if (!(weight >= 0)) bad('needs a weight of 0 or more')
  }
  return { conditions, weight }
}

/**
 * The edge that carries a message from a port: among the edges whose conditions all hold, those
 * with conditions beat those with none, and a draw weighted by their weights picks among
 * several. Undefined when no edge may carry it.
 * @template {{ route: Route }} E
 * @param {E[]} edges  the edges leaving the port
 * @param {any} msg
 * @param {() => number} random  a uniform draw in [0, 1), taken only when there is a choice
 * @returns {E | undefined}
 */
export function pickEdge(edges, msg, random) {
  let open = edges.filter(e => e.route.conditions.every(holds => holds(msg)))
  if (open.some(e => e.route.conditions.length)) open = open.filter(e => e.route.conditions.length)
  if (open.length < 2) return open[0]
  const total = open.reduce((sum, e) => sum + e.route.weight, 0)
  if (!(total > 0)) return undefined
  let left = random() * total
  for (const e of open) if ((left -= e.route.weight) < 0) return e
  return open.filter(e => e.route.weight > 0).at(-1)
}
