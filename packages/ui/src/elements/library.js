/**
 * <strata-library>: component and system library with search and drag-to-place (spec §9).
 * Drag an item onto the canvas, or click it to add it in the middle of the view.
 *
 * Components can be added here too (spec §7 "Loading paths": upload): drop a packed
 * .strata.js, a zip of a component folder or the folder itself on the panel, or use Add….
 * The in-browser packer is the same code as `strata pack`.
 */
import { StrataElement, h, fill, define } from './base.js'

const DROP_TYPE = 'application/x-strata'

export class StrataLibrary extends StrataElement {
  static css = `
:host { display: flex; flex-direction: column; min-height: 0; }
.content { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.search { padding: 8px; border-bottom: 1px solid var(--st-line); }
.search input { width: 100%; }
.list { overflow: auto; padding: 0 8px 8px; flex: 1; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
li button { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 1px; cursor: grab; background: var(--st-field); }
li button small { color: var(--st-muted); font-size: 11px; }
li .actions { display: flex; gap: 4px; }
li .actions button { width: auto; cursor: pointer; background: transparent; }
.system { display: flex; gap: 4px; }
.system > button:first-child { flex: 1; }
.search { display: flex; gap: 6px; }
.search input { flex: 1; min-width: 0; }
:host(.dropping) .list { outline: 2px dashed var(--st-accent); outline-offset: -4px; background: var(--st-accent-soft); }
.report { margin: 8px 0; padding: 8px; border: 1px solid var(--st-line); border-radius: var(--st-radius); background: var(--st-field); font-size: 12px; }
.report.failed { border-color: var(--st-danger); }
.report ul { display: block; margin: 4px 0; padding-left: 16px; list-style: disc; }
.report li { margin: 2px 0; overflow-wrap: anywhere; }
.report header { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
`

  #query = ''
  #list
  #search
  /** @type {HTMLInputElement} */
  #picker
  /** The outcome of the last upload: { title, problems, error }. */
  #report = null

  constructor() {
    super()
    this.#search = h('input', {
      type: 'search',
      placeholder: 'Search components and systems',
      'aria-label': 'Search the library',
      oninput: e => {
        this.#query = e.target.value.trim().toLowerCase()
        this.update()
      },
    })
    this.#picker = /** @type {HTMLInputElement} */ (
      h('input', {
        type: 'file',
        multiple: true,
        accept: '.js,.zip',
        hidden: true,
        'aria-label': 'Component files',
        onchange: e => {
          const files = [...e.target.files].map(file => ({
            file,
            path: file.webkitRelativePath || file.name,
          }))
          e.target.value = ''
          this.#upload(files)
        },
      })
    )
    this.#list = h('div', { class: 'list' })
    this.content.append(
      h(
        'div',
        { class: 'search' },
        this.#search,
        h(
          'button',
          {
            title:
              'Add a component: a packed .strata.js or a zipped component folder. You can also drop files or a folder on the library.',
            onclick: () => this.#picker.click(),
          },
          'Add…'
        ),
        this.#picker
      ),
      this.#list
    )

    this.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      this.classList.add('dropping')
    })
    this.addEventListener('dragleave', e => {
      if (!this.contains(/** @type {Node} */ (e.relatedTarget))) this.classList.remove('dropping')
    })
    this.addEventListener('drop', e => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      this.classList.remove('dropping')
      droppedFiles(e.dataTransfer).then(files => this.#upload(files))
    })
  }

  /** Packs and installs uploaded files, then reports what happened. */
  async #upload(entries) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    if (!entries.length) return
    try {
      const files = await Promise.all(
        entries.map(async ({ file, path }) => ({
          path,
          content: new Uint8Array(await file.arrayBuffer()),
        }))
      )
      const { component, problems } = await strata.components.upload(files, { replace: true })
      if (component) {
        shell.notify(`Added ${component.name} (${component.typeRef})`, 'success')
        this.#report = problems.length
          ? {
              title: `${component.name}: ${problems.length} warning${problems.length > 1 ? 's' : ''}`,
              problems,
              error: false,
            }
          : null
      } else {
        this.#report = { title: 'The component was not added', problems, error: true }
      }
    } catch (err) {
      this.#report = {
        title: 'The component was not added',
        problems: [{ level: 'error', file: '', message: err.message }],
        error: true,
      }
    }
    this.update()
  }

  subscribe(strata) {
    return ['change', 'project', 'navigate', 'components'].map(event =>
      strata.on(event, () => this.invalidate())
    )
  }

  update() {
    const strata = /** @type {any} */ (this.strata)
    const match = (...texts) =>
      !this.#query ||
      texts.some(t =>
        String(t ?? '')
          .toLowerCase()
          .includes(this.#query)
      )
    const components = strata.components
      .list({ kind: 'component' })
      .filter(c => !c.abstract && match(c.name, c.id, c.category))
    const groups = new Map()
    for (const c of components) {
      const key = c.category || 'Other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }
    const project = strata.project
    const writable = !!project && !project.nav.current.readOnly
    const systems = project ? project.library().filter(s => match(s.name)) : []
    const sections = []
    for (const [category, items] of [...groups].sort(
      (a, b) => Number(a[0] === 'Base') - Number(b[0] === 'Base') || a[0].localeCompare(b[0])
    )) {
      sections.push(
        h('h2', null, category),
        h(
          'ul',
          null,
          items.map(c =>
            h(
              'li',
              null,
              h(
                'button',
                {
                  draggable: 'true',
                  disabled: !writable,
                  title: `Drag onto the canvas, or click to add ${c.name}`,
                  ondragstart: e => {
                    e.dataTransfer.setData(DROP_TYPE, JSON.stringify({ typeRef: c.id }))
                    e.dataTransfer.effectAllowed = 'copy'
                  },
                  onclick: () => this.#add(c.id),
                },
                c.name,
                h('small', null, `${c.id}@${c.version}`)
              )
            )
          )
        )
      )
    }
    if (project) {
      sections.push(h('h2', null, 'Systems'))
      sections.push(
        systems.length
          ? h(
              'ul',
              null,
              systems.map(s =>
                h(
                  'li',
                  null,
                  h(
                    'div',
                    { class: 'system' },
                    h(
                      'button',
                      {
                        draggable: 'true',
                        disabled: !writable,
                        title:
                          'Drag or click to place by reference (linked, read-only where placed)',
                        ondragstart: e => {
                          e.dataTransfer.setData(
                            DROP_TYPE,
                            JSON.stringify({ systemRef: s.id, placement: 'reference' })
                          )
                          e.dataTransfer.effectAllowed = 'copy'
                        },
                        onclick: () => this.#place(s.id, 'reference'),
                      },
                      s.name,
                      h('small', null, `${s.nodes().length} nodes · reference`)
                    ),
                    h(
                      'button',
                      {
                        title: `Place an editable copy of ${s.name}`,
                        'aria-label': `Place a copy of ${s.name}`,
                        disabled: !writable,
                        onclick: () => this.#place(s.id, 'value'),
                      },
                      'Copy'
                    ),
                    h(
                      'button',
                      {
                        title: `Open ${s.name} to edit it`,
                        'aria-label': `Open ${s.name}`,
                        onclick: () => strata.nav.enter(s),
                      },
                      'Open'
                    )
                  )
                )
              )
            )
          : h(
              'p',
              { class: 'muted' },
              this.#query
                ? 'No matching systems.'
                : 'No library systems yet. Extract a selection or use “New library system”.'
            )
      )
      sections.push(
        h('h2', null, 'Patterns'),
        h('p', { class: 'muted' }, 'Saved patterns arrive in R1.')
      )
    }
    if (!components.length && !systems.length && this.#query)
      sections.unshift(h('p', { class: 'empty' }, `Nothing matches “${this.#query}”.`))
    const report = this.#report
    if (report) {
      sections.unshift(
        h(
          'div',
          {
            class: `report${report.error ? ' failed' : ''}`,
            role: report.error ? 'alert' : 'status',
          },
          h(
            'header',
            null,
            h('span', null, report.title),
            h(
              'button',
              {
                class: 'ghost',
                'aria-label': 'Dismiss',
                onclick: () => {
                  this.#report = null
                  this.update()
                },
              },
              '×'
            )
          ),
          h(
            'ul',
            null,
            report.problems.map(p =>
              h(
                'li',
                null,
                `${p.file ? `${p.file}${p.line ? `:${p.line}` : ''}: ` : ''}${p.message}`
              )
            )
          )
        )
      )
    }
    fill(this.#list, ...sections)
  }

  /** @param {string} typeRef */
  #add(typeRef) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    this.attempt(() => {
      const node = strata.project.nav.current.add(typeRef, { at: shell.canvas?.freeSpot() })
      shell.select([node.id])
    })
  }

  /** @param {string} systemId @param {'reference'|'value'} placement */
  #place(systemId, placement) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    this.attempt(() => {
      const node = strata.project.nav.current.place(systemId, {
        placement,
        at: shell.canvas?.freeSpot(),
      })
      shell.select([node.id])
    })
  }
}

/**
 * Files from a drop, with folder structure: a dropped folder is read recursively so its
 * paths ('message-queue/lib/backoff.js') reach the packer.
 * @param {DataTransfer} data
 * @returns {Promise<{ file: File, path: string }[]>}
 */
async function droppedFiles(data) {
  const entries = [...data.items].map(item => item.webkitGetAsEntry?.()).filter(Boolean)
  if (!entries.length) return [...data.files].map(file => ({ file, path: file.name }))
  const out = []
  const read = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject))
      out.push({ file, path: `${prefix}${entry.name}` })
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
        if (!batch.length) break
        for (const child of batch) await read(child, `${prefix}${entry.name}/`)
      }
    }
  }
  for (const entry of entries) await read(entry, '')
  return out
}

define('strata-library', StrataLibrary)
