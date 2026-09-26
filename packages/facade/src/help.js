/**
 * `strata.help(topic)`: commands with signatures and examples (spec §16).
 */

/** Namespaces that arrive in later milestones, with where they land. */
export const PLANNED = Object.freeze({
  test: {
    release: 'R1',
    what: 'functional, SLO, resilience and architecture-rule tests',
    example: "await strata.test.run({ tags: ['slo'] })",
  },
  debug: {
    release: 'R1',
    what: 'breakpoints, stepping, hop inspection and trace waterfall',
    example: "strata.debug.setBreakpoint({ node: 'Orders', on: 'arrival' })",
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

/** @type {Record<string, { summary: string, entries: [string, string, string?][] }>} */
const TOPICS = {
  sim: {
    summary:
      'Simulation (spec §11). So far one request over one edge, as in the walking skeleton; run controls follow (spec §12).',
    entries: [
      [
        'await strata.sim.start({ system, edge, seed })',
        'Run one request over an edge and wait for the response',
        'const run = await strata.sim.start({ seed: 42 })',
      ],
      [
        'run.response.atUs / run.trace / run.hash',
        'When the response arrived, every hop, and the run hash',
      ],
    ],
  },
  projects: {
    summary: 'Create, open, save and switch projects. One project = one .strata file.',
    entries: [
      [
        'strata.projects.create(name)',
        'Create a project and make it active',
        "const p = await strata.projects.create('checkout')",
      ],
      [
        'strata.projects.open(nameOrId)',
        'Open a saved project and make it active',
        "const p = await strata.projects.open('checkout')",
      ],
      ['strata.projects.list()', 'Saved projects (use console.table(list.toTable()))'],
      ['strata.projects.use(project)', 'Switch the active project'],
      ['strata.projects.close(project)', 'Close an open project'],
      ['strata.projects.delete(nameOrId)', 'Delete a saved project'],
      ['p.root', 'The root system'],
      ['p.system(idOrName) / p.systems()', 'Any system, editable; all systems'],
      [
        'p.createSystem(name, { levelTag, contract })',
        'A library system to place by reference or by value',
      ],
      [
        'p.node(idOrName) / p.nodes({ extends: "base:queue" })',
        'Find nodes anywhere in the project',
      ],
      ['p.edge(idOrLabel)', 'Find an edge by id or label'],
      ['p.problems()', 'Everything the Problems panel would show'],
      ['await p.save()', 'Write the project to storage'],
    ],
  },
  system: {
    summary: 'A system holds nodes and edges; any system can be placed inside another (§6).',
    entries: [
      [
        'sys.add(type, { name, props, at })',
        'Add a component',
        "const gw = root.add('api-gateway', { name: 'Edge GW', props: { rateLimit: 1000 } })",
      ],
      [
        'sys.connect(from, to, { type, props, label })',
        'Connect ports (a node picks its compatible port)',
        "root.connect(gw.port('out'), svc.port('in'), { type: 'http' })",
      ],
      [
        'sys.extract(nodes, { name })',
        'Extract as system: move nodes into a new child system',
        "const orders = root.extract([svc.id, db.id], { name: 'Orders System' })",
      ],
      ['sys.inline(node)', 'Dissolve a composite back into this system'],
      [
        'sys.place(system, { placement })',
        "Place another system here, 'reference' (linked) or 'value' (copy)",
      ],
      ['sys.expose(port, { name })', 'Publish an internal port as a boundary port'],
      [
        'sys.node(idOrName) / sys.nodes() / sys.edges() / sys.ports()',
        'Contents, as collections with toTable()',
      ],
      [
        'sys.rollup(key, { detail })',
        'Derived value from the children',
        "orders.rollup('latency.p99')",
      ],
      ['sys.contracts()', 'Declared contract checked against derived values'],
      ['sys.set({ name, levelTag, contract, rollups })', 'Update the system'],
      ['sys.enter()', 'Drill down (the UI follows if attached)'],
    ],
  },
  node: {
    summary: 'A node is a component instance (atomic) or a placed system (composite).',
    entries: [
      ['node.props / node.explain()', 'Effective property values, and where each comes from'],
      [
        'node.set({ key: value }) / node.unset(key)',
        'Change properties (validated against the manifest)',
      ],
      ['node.update({ name, owner, status, tags })', 'Change node fields'],
      ['node.port(name) / node.ports() / node.addPort(name, { direction })', 'Ports'],
      ['node.connect(to, { type })', 'Connect from this node'],
      ['node.moveTo(x, y)', 'Position in the first view'],
      ['node.child / node.enter() / node.rollup(key)', 'Composites: the contained system'],
      ['node.detach() / node.inline()', 'Composites: copy a reference; dissolve'],
      ['node.remove()', 'Remove from the model and every view'],
    ],
  },
  nav: {
    summary: 'Breadcrumb navigation through nested systems.',
    entries: [
      ['strata.nav.enter(target)', 'Enter a composite node or a system'],
      ['strata.nav.up() / strata.nav.home()', 'Go up one level; back to the root'],
      ['strata.nav.current / strata.nav.breadcrumb', 'Where you are'],
      ['strata.$ / strata.select(...items)', 'Current selection'],
    ],
  },
  history: {
    summary: 'Every change is a serialisable command in the op log, so it can be undone.',
    entries: [
      ['strata.undo() / strata.redo()', 'Undo and redo in the active project'],
      ['strata.transaction(fn, { label })', 'Several commands as one undo step'],
      [
        'strata.dispatch({ type, payload })',
        'Apply any command directly',
        "strata.dispatch({ type: 'node.update', payload: { id, changes: { owner: 'payments' } } })",
      ],
      ['strata.commands()', 'Every command with its signature'],
      ['p.oplog', 'Operations applied this session'],
    ],
  },
  events: {
    summary: 'Changes arrive as events.',
    entries: [
      ["strata.on('change', ({ project, op, changes }) => …)", 'After every operation'],
      ["strata.on('navigate', ({ breadcrumb, current }) => …)", 'After drill-down'],
      ["strata.on('select', ({ ids }) => …)", 'Selection changed'],
      ["strata.on('project', ({ action, project }) => …)", 'create, open, activate, close, delete'],
      ["strata.on('history', ({ canUndo, canRedo }) => …)", 'Undo availability changed'],
      [
        "strata.on('components', ({ action, typeRef }) => …)",
        'A component type was installed or removed',
      ],
    ],
  },
  components: {
    summary: 'Component types. Built-in base types use the same API as plugins.',
    entries: [
      [
        'strata.components.list({ kind })',
        "Registered types; kind 'component' or 'connection-type'",
      ],
      [
        'strata.components.connectionTypes()',
        'Connection types for edges (http, grpc, async-message, ...)',
      ],
      ['strata.components.get(name)', 'A manifest with inheritance applied'],
      [
        'strata.components.install(bundle)',
        'Install a packed component (a bundle or the text of a .strata.js)',
      ],
      [
        'await strata.components.upload(files)',
        'Pack and install a .strata.js, a zip or a folder’s files',
        "await strata.components.upload([{ path: 'queue.strata.js', content: text }])",
      ],
      ['strata.components.uninstall(ref)', 'Remove a plugin; its nodes become placeholders'],
      ['strata.components.bundle(name)', 'The packed bundle of an installed plugin'],
      ['strata.components.register(manifest)', 'Register a bare manifest (no behaviour code)'],
    ],
  },
  output: {
    summary: 'Reading the model as text.',
    entries: [
      [
        'strata.print(target?)',
        'Print a project, system or node as a tree (default: current system)',
      ],
      ['strata.format(target?)', 'The same text, returned'],
      ['collection.toTable()', 'Rows for console.table'],
    ],
  },
}

/**
 * @param {string} [topic]
 * @returns {string}
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
    const lines = [`${topic}: ${t.summary}`, '']
    for (const [signature, description, example] of t.entries) {
      lines.push(`  ${signature}`, `      ${description}`)
      if (example) lines.push(`      e.g. ${example}`)
    }
    return lines.join('\n')
  }
  const p = PLANNED[topic]
  if (p) return `strata.${topic} arrives in ${p.release}: ${p.what}.\n  e.g. ${p.example}`
  return `No help topic '${topic}'. Topics: ${[...Object.keys(TOPICS), ...Object.keys(PLANNED)].join(', ')}.`
}
