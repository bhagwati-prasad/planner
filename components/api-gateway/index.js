// @ts-check
/**
 * The starter API gateway (spec §9). A request must match one of its routes, when it has any,
 * and fit its maximum payload. It is authenticated by the auth mode and limited per key by a
 * token bucket that refills at the rate limit and holds the burst. After the transform latency
 * it is answered from the response cache, for reads within its TTL, or forwarded on `out` with
 * its path and headers, so the edges' route rules choose the upstream (ADR 0019). An upstream
 * that does not answer within the request timeout gets GATEWAY_TIMEOUT, at the timeout.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

/**
 * Whether a route such as 'GET /orders/*' or '/health' matches a request. A `*` matches one
 * segment, or, last, the rest of the path.
 * @param {string} route @param {string|null} verb @param {string} path
 */
function matches(route, verb, path) {
  const [first, second] = String(route).trim().split(/\s+/)
  const [want, pattern] = second === undefined ? [null, first] : [first.toUpperCase(), second]
  if (want && want !== verb) return false
  const parts = pattern.split('/')
  const segments = path.split('/')
  const rest = parts.at(-1) === '*'
  if (rest ? segments.length < parts.length : segments.length !== parts.length) return false
  return parts.every((part, i) => part === '*' || part === segments[i])
}

/** Fails a request, counting it under `metric`. @param {Ctx} ctx @param {string} metric @param {string} code @param {object} details */
function refuse(ctx, metric, code, details) {
  ctx.metric(metric, 1)
  return ctx.fail(code, details)
}

export default {
  public: {
    /** Checks a request, then answers it from the cache or forwards it upstream. */
    async forward(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const path = msg.path ?? '/'
      const headers = Object.fromEntries(
        Object.entries(msg.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])
      )
      const verb = headers.method ? String(headers.method).toUpperCase() : null
      if (
        props.routes.length &&
        !props.routes.some((/** @type {string} */ r) => matches(r, verb, path))
      )
        return ctx.fail('NO_ROUTE', { path, method: verb })
      if (msg.sizeBytes > props.maxPayload)
        return ctx.fail('PAYLOAD_TOO_LARGE', {
          sizeBytes: msg.sizeBytes,
          maxPayload: props.maxPayload,
        })
      const key = ctx.call('authenticate', headers)
      if (key === null)
        return refuse(ctx, 'authFailures', 'AUTH_FAILED', { authMode: props.authMode })
      if (!ctx.call('rateLimit', key)) return refuse(ctx, 'throttled', 'THROTTLED', { key })
      await ctx.spend(ctx.call('transform'))
      const cacheable = props.responseCacheTtl > 0 && (verb === null || verb === 'GET')
      const cached = cacheable ? ctx.call('cacheLookup', path) : null
      if (cached) return cached.body
      let timedOut = false
      let body
      try {
        body = await Promise.race([
          ctx.send('out', null, msg.body, { path, headers: msg.headers }),
          ctx.spend(props.requestTimeout).then(() => {
            timedOut = true
          }),
        ])
      } catch (err) {
        return ctx.fail('BAD_GATEWAY', { code: /** @type {any} */ (err)?.code ?? 'FAILED' })
      }
      if (timedOut) return ctx.fail('GATEWAY_TIMEOUT', { timeoutMs: props.requestTimeout })
      if (cacheable) state.cache[path] = { body, at: ctx.now }
      return body
    },
  },

  private: {
    /**
     * The key a request is limited by, or null when it fails the auth mode: an API key for
     * `api-key`, a bearer token for `jwt` and `oauth2`, a client certificate for `mtls`.
     */
    authenticate(/** @type {Record<string, string>} */ headers, /** @type {Ctx} */ ctx) {
      const bearer = /^Bearer\s+(\S+)/i.exec(headers.authorization ?? '')?.[1] ?? null
      switch (ctx.props.authMode) {
        case 'api-key':
          return headers['x-api-key'] || null
        case 'jwt':
        case 'oauth2':
          return bearer
        case 'mtls':
          return headers['x-client-cert'] || null
        default:
          return headers['x-api-key'] || bearer || 'anonymous'
      }
    },

    /** Takes a token from the key's bucket, refilled at the rate limit up to the burst; false when it has none. */
    rateLimit(/** @type {string} */ key, /** @type {Ctx} */ ctx) {
      const { rateLimit, burst } = ctx.props
      const capacity = Math.max(1, burst)
      const bucket = ctx.state.buckets[key] ?? { tokens: capacity, at: ctx.now }
      const tokens = Math.min(capacity, bucket.tokens + ((ctx.now - bucket.at) * rateLimit) / 1000)
      const allowed = tokens >= 1
      ctx.state.buckets[key] = { tokens: allowed ? tokens - 1 : tokens, at: ctx.now }
      return allowed
    },

    /** How long the request and response transforms take, in ms. */
    transform: (/** @type {unknown} */ _, /** @type {Ctx} */ ctx) =>
      ctx.sample(ctx.props.transformLatency),

    /** The cached response for a path, as { body }, while its TTL lasts; null on a miss. */
    cacheLookup(/** @type {string} */ path, /** @type {Ctx} */ ctx) {
      const { state } = ctx
      const entry = state.cache[path]
      const hit = entry !== undefined && ctx.now - entry.at < ctx.props.responseCacheTtl
      state.cacheLookups++
      if (hit) state.cacheHits++
      ctx.metric('cacheHitRatio', state.cacheHits / state.cacheLookups)
      return hit ? { body: entry.body } : null
    },
  },
}
