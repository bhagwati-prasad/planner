/**
 * `strata new component`: the files of a new component folder (spec §7 "Folder layout").
 */

/** The built-in base behaviours a component can extend (spec §7 "Behaviour API"). */
export const BASE_TYPES = Object.freeze([
  'base:client',
  'base:service',
  'base:queue',
  'base:topic',
  'base:store',
  'base:cache',
  'base:proxy',
  'base:timer',
  'base:external',
])

const CATEGORY = {
  'base:client': 'Clients',
  'base:service': 'Compute',
  'base:queue': 'Messaging',
  'base:topic': 'Messaging',
  'base:store': 'Data',
  'base:cache': 'Data',
  'base:proxy': 'Edge',
  'base:timer': 'Compute',
  'base:external': 'External',
}

/** @param {string} name e.g. 'order-router' */
const titleOf = name =>
  name
    .split('-')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ')

/**
 * @param {string} name folder name (lowercase, hyphenated)
 * @param {{ extends?: string, id?: string }} [options]
 * @returns {Record<string, string>} path → content
 */
export function scaffoldComponent(
  name,
  { extends: base = 'base:service', id = `local.${name}` } = {}
) {
  const title = titleOf(name)
  const manifest = {
    strataApi: '^1.0',
    id,
    name: title,
    version: '0.1.0',
    category: CATEGORY[base] ?? 'Custom',
    description: `What ${title} does, in one sentence.`,
    icon: 'icon.svg',
    entry: 'index.js',
    extends: base,
    properties: {
      serviceTime: {
        type: 'distribution',
        unit: 'ms',
        default: { kind: 'lognormal', median: 20, p99: 120 },
        group: 'Performance',
        description: 'Time to handle one message',
      },
    },
    metrics: {
      handled: { unit: 'messages', rollup: 'sum', description: 'Messages handled so far' },
    },
  }
  return {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    // Lets Node run the self-tests as ES modules; the packer leaves it out of the bundle.
    'package.json': `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
    'icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
  <rect x="3.5" y="5" width="17" height="14" rx="2.5"/>
  <path d="M7.5 10h9M7.5 14h6"/>
</svg>
`,
    'index.js': `// Behaviour of ${title}. It runs only inside the simulation worker, never on the page.
// Every hook is optional: leave one out and the base behaviour (${base}) applies.
// ctx: props, state, now, random(), sample(dist), send(port, msg), forward(msg),
//      reply(msg, response), reject(msg, code), schedule(delay, name, data), metric(name, value), log(level, ...args)

export default {
  init (ctx) {
    ctx.state.handled = 0
  },

  onMessage (msg, ctx) {
    ctx.schedule(ctx.sample(ctx.props.serviceTime), 'done', { msg })
  },

  onTimer (name, ctx, data) {
    if (name !== 'done') return
    ctx.state.handled += 1
    ctx.metric('handled', ctx.state.handled)
    ctx.forward(data.msg)
  }
}
`,
    'README.md': `# ${title}

What ${title} does, when to use it, and what its properties mean.

- Pack it: \`strata pack ${name}\` writes \`${name}.strata.js\`.
- Check it: \`strata validate ${name}\` and \`strata test-component ${name}\`.
- Use it offline: \`strata pack ${name} --install strata.html\`, or drop the \`.strata.js\` on the library panel.

Change the \`id\` in manifest.json to your own namespace (for example \`acme.${name}\`) before you share it.
`,
    [`tests/${name}.test.js`]: `// Self-tests for ${title}: plain node:test, run by \`strata test-component\`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import behaviour from '../index.js'

/** A minimal stand-in for the simulation context. */
function fakeContext (props = {}) {
  const calls = []
  return {
    calls,
    props: { serviceTime: 20, ...props },
    state: {},
    now: 0,
    sample: dist => (typeof dist === 'number' ? dist : dist.median),
    schedule: (delay, name, data) => calls.push(['schedule', delay, name, data]),
    forward: msg => calls.push(['forward', msg]),
    metric: (name, value) => calls.push(['metric', name, value])
  }
}

test('a message is forwarded after the service time', () => {
  const ctx = fakeContext()
  behaviour.init(ctx)
  behaviour.onMessage('m1', ctx)
  assert.deepEqual(ctx.calls, [['schedule', 20, 'done', { msg: 'm1' }]])
  behaviour.onTimer('done', ctx, { msg: 'm1' })
  assert.deepEqual(ctx.calls.slice(1), [['metric', 'handled', 1], ['forward', 'm1']])
})
`,
  }
}
