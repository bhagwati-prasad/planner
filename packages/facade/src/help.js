/**
 * `strata.help(topic)`: commands with signatures and examples (spec §18), generated from the
 * JSDoc of the facade (eng §20).
 */
import { HELP } from './help-data.js'

/** Namespaces that arrive in later milestones, with where they land. */
export const PLANNED = Object.freeze({
  test: {
    release: 'R1',
    what: 'functional, SLO, resilience and architecture-rule tests',
    example: "await strata.test.run({ tags: ['slo'] })",
  },
  comments: {
    release: 'R0 milestone M6',
    what: 'annotations and threaded comments on anything',
    example: "strata.comments.add(svc, 'Should this call be async?', { type: 'question' })",
  },
  docs: {
    release: 'R2',
    what: 'living documents with live bindings to the model',
    example: "await strata.docs.render('ADR-003', { format: 'md' })",
  },
  plan: {
    release: 'R2',
    what: 'tickets generated from the architecture',
    example: "strata.plan.generate({ system: 'Payments' })",
  },
})

/**
 * The help topics. Each lists the methods of some classes, from the metadata generated out of
 * their JSDoc (help-data.js), under the name a console user holds them by; a list of method
 * names limits a class to those.
 * @type {Record<string, { summary: string, from: [string, string, string[]?][] }>}
 */
const TOPICS = {
  projects: {
    summary: 'Create, open, save and switch projects. One project = one .strata file.',
    from: [
      ['strata.projects', 'ProjectsApi'],
      ['p', 'ProjectHandle'],
    ],
  },
  system: {
    summary: 'A system holds nodes and edges; any system can be placed inside another (§6).',
    from: [
      ['sys', 'SystemHandle'],
      ['bp', 'BoundaryPortHandle'],
    ],
  },
  node: {
    summary:
      'A node is a component, or a system placed or opened inside another; edges join ports.',
    from: [
      ['node', 'NodeHandle'],
      ['port', 'PortHandle'],
      ['edge', 'EdgeHandle'],
      ['handle', 'Handle'],
    ],
  },
  nav: {
    summary: 'Breadcrumb navigation through nested systems, and the selection.',
    from: [
      ['strata.nav', 'Navigator'],
      ['strata', 'Strata', ['select']],
    ],
  },
  clipboard: {
    summary: 'Copy, paste and duplicate nodes with the edges among them.',
    from: [['strata', 'Strata', ['copy', 'paste', 'duplicate']]],
  },
  history: {
    summary: 'Every change is a serialisable command in the op log, so it can be undone.',
    from: [['strata', 'Strata', ['dispatch', 'transaction', 'undo', 'redo', 'commands']]],
  },
  events: {
    summary: 'Changes arrive as events: change, navigate, select, project, history, components.',
    from: [['strata', 'Strata', ['on', 'once', 'off']]],
  },
  components: {
    summary: 'Component types. Built-in base types use the same API as plugins.',
    from: [['strata.components', 'ComponentsApi']],
  },
  sim: {
    summary:
      'Simulation (spec §11, §12): start a run, then drive it with every control; each answers with the moment it left the run at.',
    from: [
      ['strata.sim', 'SimApi'],
      ['run', 'RunHandle'],
    ],
  },
  debug: {
    summary:
      'The debugger (spec §13) on the latest run, or the one attached: breakpoints, hops, the method stack, state and effective properties.',
    from: [
      ['strata.debug', 'DebugApi'],
      ['run', 'RunHandle', ['setBreakpoint', 'clearBreakpoints']],
    ],
  },
  output: {
    summary: 'Reading the model as text.',
    from: [
      ['strata', 'Strata', ['format', 'print', 'help', 'helpText', 'toString']],
      ['collection', 'Collection'],
    ],
  },
}

/**
 * @param {string} [topic]
 * @returns {string}
 * @internal
 */
export function helpText(topic) {
  if (!topic) {
    const lines = [
      'Strata console API. Everything the UI does is available here.',
      '',
      'Topics:',
      ...Object.entries(TOPICS).map(
        ([name, t]) => `  strata.help('${name}')`.padEnd(30) + t.summary
      ),
      '',
      'Coming later:',
      ...Object.entries(PLANNED).map(
        ([name, p]) => `  strata.${name}`.padEnd(30) + `${p.what} (${p.release})`
      ),
      '',
      'Quick start:',
      "  const p = await strata.projects.create('checkout')",
      "  const gw = p.root.add('base:proxy', { name: 'Gateway' })",
      "  const svc = p.root.add('base:service', { name: 'Orders' })",
      '  p.root.connect(gw, svc)',
      '  strata.print()',
    ]
    return lines.join('\n')
  }
  const t = TOPICS[topic]
  if (t) {
    const lines = [`${topic}: ${t.summary}`]
    for (const [holder, className, only] of t.from) {
      lines.push('')
      for (const [name, params, summary, example] of HELP[className] ?? []) {
        if (only && !only.includes(name)) continue
        lines.push(`  ${holder}.${name}${params === null ? '' : `(${params})`}`, `      ${summary}`)
        if (example) lines.push(`      e.g. ${example.replace(/\n/g, '\n           ')}`)
      }
    }
    return lines.join('\n')
  }
  const p = PLANNED[topic]
  if (p) return `strata.${topic} arrives in ${p.release}: ${p.what}.\n  e.g. ${p.example}`
  return `No help topic '${topic}'. Topics: ${[...Object.keys(TOPICS), ...Object.keys(PLANNED)].join(', ')}.`
}
