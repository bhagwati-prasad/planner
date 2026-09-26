/**
 * Bottom dock panels (spec §9): Problems, and the Console, which logs every command and
 * accepts new ones as JSON. (An eval-based console would need 'unsafe-eval', which the
 * strict Content Security Policy forbids; the full JavaScript API is `strata` in the
 * browser's DevTools console.)
 */
import { StrataElement, h, fill, define } from './base.js'

const SEVERITY = { error: '●', warning: '▲', info: 'ℹ' }

export class StrataProblems extends StrataElement {
  static css = `
:host { overflow: auto; }
ul { list-style: none; margin: 0; padding: 4px; display: grid; gap: 2px; }
button { width: 100%; text-align: left; border: 0; display: grid; grid-template-columns: 18px 1fr auto; gap: 6px; padding: 3px 6px; }
.error .icon { color: var(--st-danger); }
.warning .icon { color: var(--st-warn); }
.info .icon { color: var(--st-muted); }
small { color: var(--st-muted); }
`

  subscribe(strata) {
    return ['change', 'project'].map(e => strata.on(e, () => this.invalidate()))
  }

  update() {
    const strata = /** @type {any} */ (this.strata)
    const project = strata.project
    const problems = project ? project.problems() : []
    this.dispatchEvent(
      new CustomEvent('count', {
        detail: {
          count: problems.length,
          errors: problems.filter(p => p.severity === 'error').length,
        },
      })
    )
    if (!problems.length) {
      fill(this.content, h('p', { class: 'empty' }, project ? 'No problems found.' : 'No project'))
      return
    }
    const systemName = id => {
      try {
        return project.system(id).name
      } catch {
        return ''
      }
    }
    fill(
      this.content,
      h(
        'ul',
        null,
        problems.map(p =>
          h(
            'li',
            { class: p.severity },
            h(
              'button',
              {
                title: 'Show where this is',
                onclick: () => this.#reveal(p),
              },
              h('span', { class: 'icon', 'aria-label': p.severity }, SEVERITY[p.severity] ?? '•'),
              p.message,
              h('small', null, p.systemId ? systemName(p.systemId) : '')
            )
          )
        )
      )
    )
  }

  /** Navigates to the problem's system and selects what it is about. */
  #reveal(problem) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    const project = strata.project
    if (!problem.systemId) return
    if (project.nav.current.id !== problem.systemId) {
      try {
        strata.nav.enter(project.system(problem.systemId))
      } catch (err) {
        shell.notify(err.message, 'error')
        return
      }
    }
    const id = problem.kind === 'boundaryPort' ? `bp:${problem.id}` : problem.id
    requestAnimationFrame(() => {
      shell.select([id])
      shell.canvas?.graph?.zoomTo([id], { animate: !shell.reducedMotion })
    })
  }
}

export class StrataOplog extends StrataElement {
  static css = `
:host { display: flex; flex-direction: column; min-height: 0; }
.content { display: flex; flex-direction: column; min-height: 0; flex: 1; }
ol { list-style: none; margin: 0; padding: 4px 8px; overflow: auto; flex: 1; font: var(--st-mono); font-size: 12px; display: flex; flex-direction: column-reverse; }
li { display: grid; grid-template-columns: 70px 150px 1fr; gap: 8px; padding: 1px 0; }
li .when, li .who { color: var(--st-muted); }
form { display: flex; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--st-line); }
form input { flex: 1; font: var(--st-mono); font-size: 12px; }
`

  #list
  /** @type {HTMLInputElement} */
  #input

  constructor() {
    super()
    this.#list = h('ol', { 'aria-label': 'Command log', 'aria-live': 'polite' })
    this.#input = /** @type {HTMLInputElement} */ (
      h('input', {
        'aria-label': 'Command as JSON',
        placeholder:
          '{"type": "project.update", "payload": {"changes": {"name": "Checkout"}}}   ·   full API: strata in DevTools',
      })
    )
    const form = h(
      'form',
      {
        onsubmit: e => {
          e.preventDefault()
          this.#run()
        },
      },
      this.#input,
      h('button', { type: 'submit' }, 'Run')
    )
    this.content.append(this.#list, form)
  }

  subscribe(strata) {
    return ['change', 'project'].map(e => strata.on(e, () => this.invalidate()))
  }

  update() {
    const strata = /** @type {any} */ (this.strata)
    const ops = strata.project ? strata.project.oplog.slice(-200) : []
    fill(
      this.#list,
      ...ops
        .reverse()
        .map(op =>
          h(
            'li',
            null,
            h('span', { class: 'when' }, op.timestamp.slice(11, 19)),
            h('span', null, op.meta?.undoOf ? 'undo' : op.meta?.redoOf ? 'redo' : op.command),
            h('span', { class: 'who' }, summarise(op))
          )
        )
    )
  }

  #run() {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    const text = this.#input.value.trim()
    if (!text) return
    let command
    try {
      command = JSON.parse(text)
    } catch {
      shell.notify('Commands are JSON: {"type": "...", "payload": {...}}', 'error')
      return
    }
    if (
      this.attempt(() => {
        const result = strata.dispatch(command)
        shell.notify(
          `${command.type}${result !== undefined ? ` → ${JSON.stringify(result)}` : ''}`,
          'success'
        )
      })
    )
      this.#input.value = ''
  }
}

/** A short description of an operation for the log. */
function summarise(op) {
  const p = op.payload ?? {}
  if (op.command === 'batch') return p.label ?? `${p.commands?.length ?? 0} commands`
  if (op.command === 'model.restore') return `${p.entities?.length ?? 0} entities`
  const bits = ['name', 'typeRef', 'systemRef', 'id', 'nodeId']
    .filter(k => typeof p[k] === 'string')
    .map(k => `${k}=${p[k].length > 26 ? `${p[k].slice(0, 12)}…` : p[k]}`)
  return bits.join(' ')
}

define('strata-problems', StrataProblems)
define('strata-oplog', StrataOplog)
