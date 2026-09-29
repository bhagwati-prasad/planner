// A component that reports what its code can reach inside the simulation worker (task 0402,
// spec §8 "Sandbox"). Real behaviours use only ctx (eng §10); this one looks past it on purpose.
const GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'indexedDB',
  'caches',
  'importScripts',
]

export default {
  public: {
    globals() {
      return Object.fromEntries(GLOBALS.map(name => [name, typeof globalThis[name]]))
    },
    clock() {
      return {
        random: [Math.random(), Math.random()],
        dateNow: Date.now(),
        performanceNow: performance.now(),
      }
    },
    spin() {
      for (;;) {
        // never returns, so the watchdog must stop the worker
      }
    },
    samples() {
      return { values: new Float64Array([1, 2, 3]) }
    },
  },
}
