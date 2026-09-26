/**
 * <strata-inspector> (spec §9 "Right"): tabs for Properties, Metrics, Comments and Links.
 * Shows the single selected item, or the current system when nothing is selected. Property
 * forms are generated from the component manifest's property schemas (spec §7); values are
 * validated by the core and commit on change, one undoable command each.
 */
import { parseId } from '../adapter.js'
import { StrataElement, h, fill, define } from './base.js'

const TABS = [
  { id: 'properties', title: 'Properties' },
  { id: 'metrics', title: 'Metrics' },
  { id: 'comments', title: 'Comments' },
  { id: 'links', title: 'Links' }
]
const DERIVED = [
  { key: 'monthlyCost', title: 'Monthly cost', unit: 'USD' },
  { key: 'instances', title: 'Instances' },
  { key: 'availabilityTarget', title: 'Availability', unit: '%' },
  { key: 'latency.p99', title: 'Latency p99', unit: 'ms' },
  { key: 'technology', title: 'Technologies' }
]
const LEVELS = ['', 'context', 'container', 'component', 'custom']
const STATUSES = ['planned', 'existing', 'deprecated']

export class StrataInspector extends StrataElement {
  static css = `
:host { display: flex; flex-direction: column; min-height: 0; }
.content { display: flex; flex-direction: column; min-height: 0; flex: 1; }
[role="tablist"] { display: flex; border-bottom: 1px solid var(--st-line); padding: 0 6px; }
[role="tab"] { border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 6px 8px; }
[role="tab"][aria-selected="true"] { border-bottom-color: var(--st-accent); font-weight: 600; }
.body { overflow: auto; padding: 8px 12px 16px; flex: 1; }
.title { font-size: 15px; font-weight: 700; margin: 4px 0 0; }
.kind { color: var(--st-muted); font-size: 12px; margin-bottom: 8px; }
.field { display: grid; grid-template-columns: 110px 1fr; gap: 6px; align-items: center; margin: 4px 0; }
.field > label { color: var(--st-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.field .control { display: flex; gap: 4px; align-items: center; min-width: 0; }
.field .control > input:not([type="checkbox"]), .field .control > select, .field .control > textarea { flex: 1; width: 100%; }
.unit { color: var(--st-muted); font-size: 11px; }
.source { font-size: 10px; color: var(--st-muted); border: 1px solid var(--st-line); border-radius: 8px; padding: 0 5px; white-space: nowrap; }
.source.override { color: var(--st-accent); border-color: var(--st-accent); }
.field .error { grid-column: 2; font-size: 11px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { text-align: left; padding: 3px 4px; border-bottom: 1px solid var(--st-line); }
th { color: var(--st-muted); font-weight: 500; }
.contract input { width: 100%; }
`

  #tab = 'properties'
  /** @type {string|null} explicit target from shell.inspect() */
  #target = null
  #focusField = null
  /** @type {Map<string, string>} field → error message */
  #errors = new Map()
  #tabs
  #body

  constructor () {
    super()
    this.#tabs = h('div', { role: 'tablist', 'aria-label': 'Inspector' })
    this.#body = h('div', { class: 'body', role: 'tabpanel' })
    this.content.append(this.#tabs, this.#body)
  }

  subscribe (strata, shell) {
    return [
      shell.on('selection', () => { this.#target = null; this.#errors.clear(); this.invalidate() }),
      shell.on('inspect', ({ id, focus }) => { this.#target = id; this.#focusField = focus ?? null; this.#tab = 'properties'; this.update() }),
      ...['change', 'navigate', 'project'].map(e => strata.on(e, () => this.invalidate()))
    ]
  }

  update () {
    const active = /** @type {any} */ (this.shadowRoot)?.activeElement
    const refocus = this.#focusField ?? active?.dataset?.field ?? null
    this.#focusField = null
    fill(this.#tabs, ...TABS.map(t => h('button', {
      role: 'tab',
      'aria-selected': String(t.id === this.#tab),
      onclick: () => { this.#tab = t.id; this.update() }
    }, t.title)))
    fill(this.#body, ...this.#render())
    if (refocus) {
      const el = /** @type {HTMLElement|null} */ (this.#body.querySelector(`[data-field="${CSS.escape(refocus)}"]`))
      el?.focus()
      if (el && 'select' in el && refocus === 'name') /** @type {any} */ (el).select()
    }
  }

  /** What to show: an explicit target, the single selection, or the current system. */
  #subject () {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    const project = strata.project
    if (!project) return null
    const id = this.#target ?? (shell.selection.length === 1 ? shell.selection[0] : null)
    if (!id) return { kind: 'system', handle: project.nav.current, many: shell.selection.length }
    const parsed = parseId(id)
    const current = project.nav.current
    try {
      if (parsed.kind === 'bp') return { kind: 'bp', handle: current.ports().find(bp => bp.id === parsed.id) }
      if (parsed.kind === 'ghost') return { kind: 'ghost', handle: project.node(parsed.id) }
      if (parsed.kind !== 'model') return { kind: 'system', handle: current, many: 0 }
      const node = current.nodes().find(n => n.id === id)
      if (node) return { kind: 'node', handle: node }
      const edge = current.edges().find(e => e.id === id)
      if (edge) return { kind: 'edge', handle: edge }
    } catch { /* fall through */ }
    return { kind: 'system', handle: current, many: 0 }
  }

  #render () {
    const subject = this.#subject()
    if (!subject?.handle) return [h('p', { class: 'empty' }, 'Nothing to inspect.')]
    if (this.#tab === 'metrics') return this.#metrics(subject)
    if (this.#tab === 'comments') return [h('p', { class: 'empty' }, 'Threaded comments on anything, with anchors and roll-up badges, arrive in milestone M6.')]
    if (this.#tab === 'links') return [h('p', { class: 'empty' }, 'Links to ADRs, tickets, tests and docs arrive with the documentation and planning release (R2).')]
    switch (subject.kind) {
      case 'node': return subject.handle.isComposite ? this.#composite(subject.handle) : this.#atomic(subject.handle)
      case 'edge': return this.#edge(subject.handle)
      case 'bp': return this.#boundaryPort(subject.handle)
      case 'ghost': return this.#ghost(subject.handle)
      default: return this.#system(subject.handle, subject.many)
    }
  }

  // --- field helpers -------------------------------------------------------------------------

  /**
   * A labelled row. `commit` receives the new value and runs the change; its error is shown
   * under the field.
   * @param {string} key
   * @param {string} label
   * @param {HTMLElement} control
   * @param {{ unit?: string, source?: string, onReset?: () => void, readOnly?: boolean }} [options]
   */
  #field (key, label, control, { unit, source, onReset, readOnly } = {}) {
    const error = this.#errors.get(key)
    control.dataset.field = key
    if (readOnly) control.setAttribute('disabled', '')
    return h('div', { class: 'field' },
      h('label', { title: label }, label),
      h('div', { class: 'control' },
        control,
        unit ? h('span', { class: 'unit' }, unit) : null,
        source ? h('span', { class: `source ${source}`, title: source === 'override' ? 'Set on this node' : 'Default from the component' }, source) : null,
        source === 'override' && onReset && !readOnly ? h('button', { class: 'ghost', title: 'Reset to default', 'aria-label': `Reset ${label}`, onclick: onReset }, '↺') : null
      ),
      error ? h('div', { class: 'error', role: 'alert' }, error) : null
    )
  }

  /** Commits a change; on failure keeps the message for the field. */
  #commit (key, fn) {
    try {
      fn()
      this.#errors.delete(key)
    } catch (err) {
      this.#errors.set(key, /** @type {Error} */ (err).message)
      this.update()
    }
  }

  #text (key, value, onCommit, { multiline = false, placeholder = '' } = {}) {
    const attrs = { value: value ?? '', placeholder, onchange: e => this.#commit(key, () => onCommit(e.target.value)) }
    return multiline ? h('textarea', { ...attrs, rows: 3 }) : h('input', attrs)
  }

  #select (key, value, options, onCommit) {
    return h('select', { onchange: e => this.#commit(key, () => onCommit(e.target.value)) },
      options.map(o => h('option', { value: o, selected: o === (value ?? '') }, o || '—')))
  }

  // --- subjects -------------------------------------------------------------------------------

  #header (title, kind) {
    return [h('p', { class: 'title' }, title), h('p', { class: 'kind' }, kind)]
  }

  #nodeFields (node, readOnly) {
    const e = node.entity
    return [
      this.#field('name', 'Name', this.#text('name', e.name, v => node.rename(v)), { readOnly }),
      this.#field('status', 'Status', this.#select('status', e.status, STATUSES, v => node.update({ status: v })), { readOnly }),
      this.#field('owner', 'Owner', this.#text('owner', e.owner, v => node.update({ owner: v.trim() || null }), { placeholder: 'team' }), { readOnly }),
      this.#field('tags', 'Tags', this.#text('tags', e.tags.join(', '), v => node.update({ tags: v.split(',').map(t => t.trim()).filter(Boolean) }), { placeholder: 'comma, separated' }), { readOnly }),
      this.#field('description', 'Description', this.#text('description', e.description, v => node.update({ description: v }), { multiline: true }), { readOnly })
    ]
  }

  #atomic (node) {
    const readOnly = node.readOnly || /** @type {any} */ (this.strata).project.nav.current.readOnly
    const manifest = node.manifest
    const explained = node.explain()
    const out = [
      ...this.#header(node.name, manifest ? `${manifest.name} · ${node.type}` : `${node.type} · not installed (placeholder)`),
      ...this.#nodeFields(node, readOnly)
    ]
    if (!manifest) {
      out.push(h('p', { class: 'muted' }, 'Install this component to edit its properties; the values it holds are kept.'))
      return out
    }
    const groups = new Map()
    for (const [key, schema] of Object.entries(manifest.properties)) {
      const group = schema.group ?? 'Properties'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group).push([key, schema])
    }
    for (const [group, entries] of groups) {
      out.push(h('h2', null, group))
      for (const [key, schema] of entries) {
        const info = explained[key]
        const field = `prop:${key}`
        out.push(this.#field(field, key, this.#propInput(field, schema, info?.value, v => node.set({ [key]: v })), {
          unit: schema.unit,
          source: info ? info.source : null,
          onReset: () => this.#commit(field, () => node.unset(key)),
          readOnly
        }))
      }
    }
    out.push(h('h2', null, 'Ports'), this.#portsTable(node))
    return out
  }

  /** An input for a property value, by its schema type. */
  #propInput (field, schema, value, set) {
    const commit = v => this.#commit(field, () => set(v))
    switch (schema.type) {
      case 'boolean':
        return h('input', { type: 'checkbox', checked: !!value, onchange: e => commit(e.target.checked) })
      case 'enum':
        return h('select', { onchange: e => commit(e.target.value) },
          h('option', { value: '', disabled: true, selected: value === undefined }, '—'),
          schema.values.map(o => h('option', { value: o, selected: o === value }, String(o))))
      case 'number':
      case 'integer':
      case 'percent':
        return h('input', {
          type: 'number',
          step: schema.type === 'integer' ? '1' : 'any',
          min: schema.min,
          max: schema.max ?? (schema.type === 'percent' ? 100 : undefined),
          value: value ?? '',
          onchange: e => commit(e.target.value === '' ? null : Number(e.target.value))
        })
      case 'duration':
      case 'bytes':
      case 'rate':
        return h('input', {
          value: value ?? '',
          placeholder: { duration: '250ms, 30s, 4d', bytes: '10MB', rate: '500/s' }[schema.type],
          onchange: e => commit(/^\d+(\.\d+)?$/.test(e.target.value.trim()) ? Number(e.target.value) : e.target.value.trim())
        })
      case 'distribution':
      case 'list':
      case 'map':
        return h('input', {
          value: value === undefined ? '' : JSON.stringify(value),
          placeholder: schema.type === 'distribution' ? '5 or {"kind": "lognormal", "median": 5, "p99": 40}' : 'JSON',
          onchange: e => {
            let parsed
            try { parsed = JSON.parse(e.target.value) } catch {
              this.#errors.set(field, 'Enter valid JSON')
              this.update()
              return
            }
            commit(parsed)
          }
        })
      default:
        return h('input', { value: value ?? '', onchange: e => commit(e.target.value) })
    }
  }

  #portsTable (node) {
    const ports = node.ports()
    if (!ports.length) return h('p', { class: 'muted' }, 'No ports.')
    return h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Port'), h('th', null, 'Direction'), h('th', null, 'Accepts'), h('th', null, 'Connected'))),
      h('tbody', null, ports.map(p => h('tr', null, h('td', null, p.name), h('td', null, p.direction), h('td', null, p.accepts.join(', ') || 'any'), h('td', null, p.connected ? 'yes' : '—')))))
  }

  #composite (node) {
    const strata = /** @type {any} */ (this.strata)
    const readOnly = node.readOnly || strata.project.nav.current.readOnly
    const child = node.child
    const out = [
      ...this.#header(node.name, `System placed ${node.placement === 'reference' ? `by reference (${child.name})` : 'by value'} · ${child.nodes().length} nodes`),
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: () => this.shell?.canvas?.enter(node.id) }, 'Enter'),
        node.placement === 'reference' && !readOnly ? h('button', { onclick: () => this.attempt(() => node.detach()) }, 'Make editable copy') : null,
        !readOnly ? h('button', { onclick: () => this.attempt(() => /** @type {any} */ (this.shell).select(node.inline().ids())) }, 'Inline') : null
      ),
      ...this.#nodeFields(node, readOnly),
      h('h2', null, 'Derived from its children'),
      this.#derivedTable(child)
    ]
    const contract = Object.entries(child.contract ?? {})
    if (contract.length) {
      out.push(h('h2', null, 'Contract'), h('table', null, h('tbody', null, child.contracts().map(c => h('tr', null,
        h('td', null, c.key), h('td', null, describeTarget(c.target)), h('td', { class: c.status === 'violated' ? 'error' : 'muted' }, c.status))))))
    }
    return out
  }

  #derivedTable (system) {
    const rows = DERIVED.map(d => {
      let value
      try { value = system.rollup(d.key) } catch { value = undefined }
      return { ...d, value }
    }).filter(r => r.value !== undefined && !(Array.isArray(r.value) && !r.value.length))
    if (!rows.length) return h('p', { class: 'muted' }, 'No values to roll up yet.')
    return h('table', null, h('tbody', null, rows.map(r => h('tr', null,
      h('th', null, r.title),
      h('td', null, `${formatValue(r.value)}${r.unit && typeof r.value === 'number' ? ` ${r.unit}` : ''}`)))))
  }

  #edge (edge) {
    const readOnly = /** @type {any} */ (this.strata).project.nav.current.readOnly
    const e = edge.entity
    const types = [...new Set([...edge.from.accepts, ...edge.to.accepts])]
    const options = types.length ? ['', ...types] : ['', 'http', 'grpc', 'websocket', 'async-message', 'db-protocol', 'file-batch']
    return [
      ...this.#header(`${edge.from.node.name}.${edge.from.name} → ${edge.to.node.name}.${edge.to.name}`, 'Connection'),
      this.#field('label', 'Label', this.#text('label', e.label, v => edge.update({ label: v })), { readOnly }),
      this.#field('connectionType', 'Type', this.#select('connectionType', e.connectionType ?? '', options, v => edge.update({ type: v || null })), { readOnly }),
      this.#field('edgeProps', 'Properties', this.#text('edgeProps', Object.keys(e.props).length ? JSON.stringify(e.props) : '', v => {
        const next = v.trim() ? JSON.parse(v) : {}
        const removed = Object.keys(e.props).filter(k => !(k in next))
        if (removed.length) edge.unset(...removed)
        if (Object.keys(next).length) edge.set(next)
      }, { placeholder: '{"timeout": "2s", "retries": 2}' }), { readOnly }),
      h('div', { class: 'actions' }, readOnly ? null : h('button', { onclick: () => this.attempt(() => edge.remove()) }, 'Delete connection'))
    ]
  }

  #boundaryPort (bp) {
    const readOnly = /** @type {any} */ (this.strata).project.nav.current.readOnly
    const internal = bp.internal
    return [
      ...this.#header(bp.name, `Boundary port · ${bp.direction}`),
      this.#field('bpName', 'Name', this.#text('bpName', bp.name, v => bp.rename(v)), { readOnly }),
      h('p', { class: internal ? 'muted' : 'error' }, internal ? `Maps to ${internal.node.name}.${internal.name}` : 'Not connected to anything inside: drag from it to an internal port.'),
      readOnly ? null : h('div', { class: 'actions' }, h('button', { onclick: () => this.attempt(() => bp.remove()) }, 'Remove boundary port'))
    ]
  }

  #ghost (node) {
    const strata = /** @type {any} */ (this.strata)
    return [
      ...this.#header(node.name, `In ${node.system.name} (the parent system)`),
      h('p', { class: 'muted' }, 'Shown for context: this is where traffic into or out of this system comes from.'),
      h('div', { class: 'actions' }, h('button', {
        onclick: () => {
          strata.nav.up()
          requestAnimationFrame(() => /** @type {any} */ (this.shell).select([node.id]))
        }
      }, `Go to ${node.system.name}`))
    ]
  }

  #system (system, many) {
    const readOnly = system.readOnly
    const e = system.entity
    const out = [
      ...this.#header(system.name, `System${e.levelTag ? ` · ${e.levelTag}` : ''}${system.isRoot ? ' · root' : system.isLibrary ? ' · library' : ''}${readOnly ? ' · read-only here' : ''}`),
      many > 1 ? h('p', { class: 'muted' }, `${many} items selected.`) : null,
      this.#field('sysName', 'Name', this.#text('sysName', e.name, v => system.rename(v)), { readOnly }),
      this.#field('level', 'C4 level', this.#select('level', e.levelTag ?? '', LEVELS, v => system.set({ levelTag: v || null })), { readOnly }),
      this.#field('sysDescription', 'Description', this.#text('sysDescription', e.description, v => system.set({ description: v }), { multiline: true }), { readOnly }),
      h('h2', null, 'Derived from its children'),
      this.#derivedTable(system),
      h('h2', null, 'Contract'),
      this.#contractEditor(system, readOnly)
    ]
    const ports = system.ports()
    out.push(h('h2', null, 'Boundary ports'), ports.length
      ? h('table', null, h('tbody', null, ports.map(bp => h('tr', null, h('td', null, bp.name), h('td', null, bp.direction), h('td', { class: bp.internal ? '' : 'error' }, bp.internal ? `${bp.internal.node.name}.${bp.internal.name}` : 'unmapped')))))
      : h('p', { class: 'muted' }, 'None. Extracting a selection creates them; or publish a port with system.expose() in the console.'))
    return out
  }

  #contractEditor (system, readOnly) {
    const contract = system.contract ?? {}
    const checks = new Map(system.contracts().map(c => [c.key, c]))
    const save = next => this.#commit('contract', () => system.set({ contract: next }))
    const rows = Object.entries(contract).map(([key, target]) => h('tr', null,
      h('td', null, key),
      h('td', null, h('input', {
        type: 'number',
        'aria-label': `Maximum for ${key}`,
        value: target.max ?? '',
        disabled: readOnly,
        onchange: ev => save({ ...contract, [key]: { ...target, max: ev.target.value === '' ? undefined : Number(ev.target.value) } })
      })),
      h('td', null, target.unit ?? ''),
      h('td', { class: checks.get(key)?.status === 'violated' ? 'error' : 'muted' }, checks.get(key)?.status ?? ''),
      h('td', null, readOnly ? null : h('button', {
        class: 'ghost',
        'aria-label': `Remove ${key}`,
        onclick: () => {
          const next = { ...contract }
          delete next[key]
          save(next)
        }
      }, '×'))
    ))
    const keyInput = h('input', { placeholder: 'latency.p99', 'aria-label': 'Contract key', 'data-field': 'contractKey' })
    const maxInput = h('input', { type: 'number', placeholder: 'max', 'aria-label': 'Contract maximum' })
    const unitInput = h('input', { placeholder: 'unit', 'aria-label': 'Contract unit' })
    return h('div', { class: 'contract' },
      rows.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Key'), h('th', null, 'Max'), h('th', null, 'Unit'), h('th', null, 'Now'), h('th'))), h('tbody', null, rows)) : h('p', { class: 'muted' }, 'No targets declared.'),
      readOnly ? null : h('form', {
        class: 'row',
        onsubmit: ev => {
          ev.preventDefault()
          const key = /** @type {HTMLInputElement} */ (keyInput).value.trim()
          const max = /** @type {HTMLInputElement} */ (maxInput).value
          if (!key || max === '') return
          const unit = /** @type {HTMLInputElement} */ (unitInput).value.trim()
          save({ ...contract, [key]: { max: Number(max), ...(unit ? { unit } : {}) } })
        }
      }, keyInput, maxInput, unitInput, h('button', { type: 'submit' }, 'Add')),
      this.#errors.get('contract') ? h('p', { class: 'error', role: 'alert' }, this.#errors.get('contract')) : null
    )
  }

  #metrics (subject) {
    const out = [h('p', { class: 'muted' }, 'Runtime metrics (latency, throughput, utilisation, queue depth) come from simulation, which arrives in R1.')]
    const system = subject.kind === 'node' && subject.handle.isComposite ? subject.handle.child : subject.kind === 'system' ? subject.handle : null
    if (system) out.push(h('h2', null, 'Derived values'), this.#derivedTable(system))
    return out
  }
}

function describeTarget (t) {
  return [t.min !== undefined ? `≥ ${t.min}` : '', t.max !== undefined ? `≤ ${t.max}` : '', t.equals !== undefined ? `= ${t.equals}` : ''].filter(Boolean).join(' ') + (t.unit ? ` ${t.unit}` : '')
}

function formatValue (v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 3 : 1).replace(/0+$/, '').replace(/\.$/, '')
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

define('strata-inspector', StrataInspector)
