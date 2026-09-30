// @ts-check
/**
 * The simulation worker's bootstrap (spec §8 "Sandbox", eng §16 "Code execution"). Before any
 * component loads it removes the globals that reach the network or storage, and makes
 * `Math.random` a seeded stream and `Date.now` and `performance.now` simulated time. It is the one
 * place that evaluates code: component behaviours arrive as script text and load through a Blob
 * URL with `importScripts`, which the strict CSP allows (`script-src 'self' blob:`), and then it
 * removes `importScripts` too. Two cases evaluate the text directly instead: a `worker_threads`
 * worker, which has no `importScripts`, and WebKit from a file:// page, which refuses the Blob
 * URL; a file:// page has no CSP, so eval is allowed there (as the human decided on 2026-09-29).
 */
import { xoshiro128ss } from '../random.js'

/**
 * Globals that reach the network or storage (spec §8), and the ways to start a worker, whose
 * own globals would reach them again.
 */
const STRIPPED = Object.freeze([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'indexedDB',
  'caches',
  'Worker',
  'SharedWorker',
])

/**
 * Removes a global from the global object and from each prototype that provides it, so that
 * neither `fetch` nor `Object.getPrototypeOf(self).fetch` reaches it.
 * @param {any} scope
 * @param {string} name
 */
function strip(scope, name) {
  for (let o = scope; o; o = Object.getPrototypeOf(o))
    if (Object.prototype.hasOwnProperty.call(o, name)) delete o[name]
  if (scope[name] !== undefined)
    Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false })
}

/**
 * @param {any} scope  the worker's global object
 * @returns {import('./session.js').Sandbox}
 */
export function bootstrap(scope) {
  for (const name of STRIPPED) strip(scope, name)
  const idle = xoshiro128ss(0)
  let clock = { random: () => idle.nextU32() / 2 ** 32, nowMs: () => 0 }
  scope.Math.random = () => clock.random()
  scope.Date.now = () => clock.nowMs()
  if (scope.performance)
    Object.defineProperty(scope.performance, 'now', {
      value: () => clock.nowMs(),
      writable: true,
      configurable: true,
    })

  return {
    evaluate(script, define) {
      scope.__strataDefine = define
      try {
        if (typeof scope.importScripts === 'function') {
          const url = scope.URL.createObjectURL(
            new scope.Blob([script], { type: 'text/javascript' })
          )
          try {
            scope.importScripts(url)
          } catch (err) {
            // WebKit refuses a Blob URL from a file:// page, where no CSP forbids eval.
            if (/** @type {any} */ (err)?.name !== 'NetworkError') throw err
            scope.eval(script)
          } finally {
            scope.URL.revokeObjectURL(url)
          }
        } else {
          // worker_threads: an indirect eval, so global. A bare `eval` token would stop the
          // minifier from renaming anything in the worker bundle.
          scope.eval(script)
        }
      } finally {
        delete scope.__strataDefine
      }
    },
    seal() {
      strip(scope, 'importScripts')
    },
    use(next) {
      clock = next
    },
  }
}
