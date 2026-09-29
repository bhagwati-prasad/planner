// Behaviour code runs only in the simulation worker (spec §8). If the page ever evaluated
// this module, the flag below would appear on the page's window.
globalThis.strataBehaviourRanOnPage = true

export default {
  public: {
    ping() {
      return { ok: true }
    },
  },
}
