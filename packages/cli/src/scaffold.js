/**
 * `strata new component`: the files of a new component folder (spec §8 "Folder layout"), with a
 * behaviour in the API of spec §8 and a self-test that uses its test context.
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
    ports: [
      { name: 'in', direction: 'in', exposes: ['handle'] },
      { name: 'out', direction: 'out' },
    ],
    state: {
      handled: { type: 'integer', initial: 0, description: 'Messages handled so far' },
    },
    methods: {
      public: {
        handle: {
          input: 'message',
          output: 'ack',
          latency: 'serviceTime',
          description: 'Handles one message',
        },
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
// Public methods answer the requests of the ports that expose them (manifest.json), and the
// return value is the response. Leave a hook out and the base behaviour (${base}) applies.
// ctx: props, state, now, random(), sample(dist), call(name, args), send(port, method, args),
//      emit(port, method, args), fail(code, details), schedule(delay, name, data),
//      metric(name, value) and log(level, ...args). Await only what ctx returns.

export default {
  public: {
    handle (msg, ctx) {
      ctx.state.handled += 1
      ctx.metric('handled', ctx.state.handled)
      return { ok: true, handledAt: ctx.now }
    }
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
    [`tests/${name}.test.js`]: `// Self-tests for ${title}: plain node:test, run by \`strata test-component\`, which
// provides 'strata/testing': a ctx that records what a method does, without the kernel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from 'strata/testing'
import behaviour from '../index.js'
import manifest from '../manifest.json' with { type: 'json' }

test('handle counts each message and answers it', () => {
  const ctx = createTestContext({ manifest, behaviour, now: 250 })
  assert.deepEqual(behaviour.public.handle({ body: { id: 'm1' } }, ctx), { ok: true, handledAt: 250 })
  assert.deepEqual(ctx.snapshot(), { handled: 1 })
  assert.deepEqual(ctx.metrics, [{ name: 'handled', value: 1 }])
})
`,
  }
}
