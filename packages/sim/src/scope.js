// @ts-check
/**
 * Request-path scopes and inbound replay (spec §11 "Scope", eng §13). A request-path scope
 * holds the components a first trace run touched: each that handled a call, and the composites
 * its requests passed through to reach it. Traffic recorded at an edge entering a scope replays
 * into the component at its end at its original simulated times, offset to the run's start.
 */

/**
 * The selection scope of the components a trace run's requests touched.
 * @param {import('./run.js').Span[]} spans
 * @returns {{ kind: 'selection', nodes: string[] }}
 */
export function requestPath(spans) {
  const nodes = new Set()
  for (const span of spans) {
    if (span.kind !== 'public' && span.kind !== 'private') continue
    const path = span.node.split('/')
    for (let depth = 1; depth <= path.length; depth++) nodes.add(path.slice(0, depth).join('/'))
  }
  return { kind: 'selection', nodes: [...nodes].sort() }
}

/**
 * Replays into a run the messages a recording run saw on each edge entering its scope, at their
 * original times after the run's current time.
 * @param {import('./run.js').Run} run
 * @param {import('./run.js').RunEdge[]} inbound  the edges entering the scope, from planRun
 * @param {Record<string, import('./run.js').Recording[]>} recordings  a recording run's
 * @returns {import('./run.js').Reply[]}  the replies, edge by edge, in recorded order
 */
export function replayInbound(run, inbound, recordings) {
  const startUs = run.nowUs
  return inbound.flatMap(edge =>
    (recordings[edge.id] ?? []).map(message =>
      run.inject({
        node: edge.to.node,
        port: edge.to.port,
        method: message.method,
        body: message.body,
        path: message.path ?? undefined,
        headers: message.headers,
        atUs: startUs + message.atUs,
      })
    )
  )
}
