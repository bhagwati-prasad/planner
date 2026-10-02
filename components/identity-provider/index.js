// @ts-check
/**
 * The starter identity provider (spec §9). It issues tokens that carry their subject and expiry,
 * as a JWT does, and live for tokenTtl. A login is challenged for MFA at the step-up
 * probability; it passes once the subject answers the open challenge with a one-time password.
 * A token is validated locally, by its signature and expiry alone (local-jwt), which cannot see
 * a revocation, or by introspection, which asks the provider and can. Requests that reach the
 * provider, all but local validations, count against its rate limit each second.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

/**
 * What a token says, or null when the provider did not issue it: its number, expiry and subject.
 * A token reads `tok.<number>.<expiresAt>.<subject>`.
 * @param {Ctx} ctx @param {unknown} token
 */
function claims(ctx, token) {
  const match = /^tok\.(\d+)\.(\d+)\.(.*)$/s.exec(String(token))
  if (!match || Number(match[1]) < 1 || Number(match[1]) > ctx.state.issued) return null
  return { expiresAt: Number(match[2]), subject: match[3] }
}

/**
 * Counts a request against the rate limit this second; the failure to answer with when it is
 * over.
 * @param {Ctx} ctx
 */
function limit(ctx) {
  const { props, state } = ctx
  const second = Math.floor(ctx.now / 1000)
  const used = state.window.second === second ? state.window.used : 0
  if (used >= props.rateLimit)
    return refuse(ctx, 'TOO_MANY_REQUESTS', { status: 429, limit: props.rateLimit })
  state.window = { second, used: used + 1 }
  return null
}

/** A failure, counted. @param {Ctx} ctx @param {string} code @param {unknown} details */
function refuse(ctx, code, details) {
  ctx.metric('failures', 1)
  return ctx.fail(code, details)
}

/** Takes a token out of the live tokens and its subject's session. @param {Ctx} ctx @param {string} token */
function drop(ctx, token) {
  const { state } = ctx
  const live = state.tokens[token]
  if (!live) return false
  delete state.tokens[token]
  const session = state.sessions[live.subject]
  session.tokens = session.tokens.filter((/** @type {string} */ t) => t !== token)
  return true
}

export default {
  public: {
    /** A token for a subject, unless its login is challenged for MFA. */
    async issueToken(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      ctx.metric('authRequests', 1)
      const refused = limit(ctx)
      if (refused) return refused
      await ctx.spend(ctx.sample(props.tokenIssueLatency))
      const subject = String(msg.body?.subject ?? 'anonymous')
      const session = (state.sessions[subject] ??= { tokens: [], challenge: false })
      if (session.challenge && msg.body?.otp) session.challenge = false
      else if (session.challenge || ctx.random() < props.mfaStepUpProbability) {
        ctx.call('mfaChallenge', { subject })
        return refuse(ctx, 'MFA_REQUIRED', { subject })
      }
      const expiresAt = ctx.now + props.tokenTtl
      const token = `tok.${++state.issued}.${expiresAt}.${subject}`
      state.tokens[token] = { subject, expiresAt }
      session.tokens.push(token)
      ctx.schedule(props.tokenTtl, 'expire', { token })
      return { token, subject, expiresAt }
    },

    /** Whether a token is active: by its signature and expiry, and by introspection whether it was revoked. */
    async validateToken(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      ctx.metric('authRequests', 1)
      const remote = props.validationMode === 'introspection'
      const refused = remote ? limit(ctx) : null
      if (refused) return refused
      await ctx.spend(ctx.sample(props.validationLatency))
      const token = msg.body?.token
      const said = claims(ctx, token)
      if (!said) return refuse(ctx, 'INVALID_TOKEN', { reason: 'unknown' })
      if (ctx.now >= said.expiresAt) return refuse(ctx, 'INVALID_TOKEN', { reason: 'expired' })
      if (remote && !state.tokens[String(token)])
        return refuse(ctx, 'INVALID_TOKEN', { reason: 'revoked' })
      return { active: true, subject: said.subject, expiresAt: said.expiresAt }
    },

    /** Revokes a token, or every live token of a subject. */
    revoke(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      ctx.metric('authRequests', 1)
      const refused = limit(ctx)
      if (refused) return refused
      const { token, subject } = msg.body ?? {}
      const tokens =
        subject === undefined ? [String(token)] : [...(ctx.state.sessions[subject]?.tokens ?? [])]
      return { revoked: tokens.filter(t => drop(ctx, t)).length }
    },
  },

  private: {
    /** Opens an MFA challenge for a subject, which its next login answers with a one-time password. */
    mfaChallenge(/** @type {{ subject: string }} */ { subject }, /** @type {Ctx} */ ctx) {
      ctx.state.sessions[subject].challenge = true
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'expire') drop(ctx, data.token)
  },
}
