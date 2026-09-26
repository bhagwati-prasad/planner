/**
 * <strata-tree>: the project tree of systems (spec §9 "Left"): the root and every system
 * placed inside it, at any depth, plus library systems. Click to navigate.
 */
import { StrataElement, h, fill, define } from './base.js'

export class StrataTree extends StrataElement {
  static css = `
:host { overflow: auto; }
.content { padding: 0 8px 8px; }
ul { list-style: none; margin: 0; padding: 0 0 0 12px; }
ul.top { padding-left: 0; }
button { border: 0; padding: 2px 6px; width: 100%; text-align: left; display: flex; gap: 6px; align-items: baseline; }
button[aria-current="true"] { background: var(--st-accent-soft); font-weight: 600; }
small { color: var(--st-muted); font-size: 11px; }
`

  subscribe(strata) {
    return ['change', 'navigate', 'project'].map(e => strata.on(e, () => this.invalidate()))
  }

  update() {
    const strata = /** @type {any} */ (this.strata)
    const project = strata.project
    if (!project) {
      fill(this.content, h('p', { class: 'empty' }, 'No project'))
      return
    }
    const currentPath = project.nav.toJSON()
    const currentKey = currentPath.map(e => e.viaNodeId ?? e.systemId).join('/')

    /** @param {any} system @param {string[]} viaIds @param {Set<string>} seen */
    const branch = (system, viaIds, seen) => {
      const key = [project.root.id, ...viaIds].join('/')
      const children = system.nodes().filter(n => n.isComposite)
      const label = viaIds.length ? project.node(viaIds.at(-1)).name : system.name
      return h(
        'li',
        { role: 'treeitem', 'aria-expanded': children.length ? 'true' : null },
        h(
          'button',
          {
            'aria-current': String(key === currentKey),
            onclick: () => this.#go(viaIds),
          },
          label,
          h('small', null, system.levelTag ?? ''),
          viaIds.length && project.node(viaIds.at(-1)).placement === 'reference'
            ? h('small', null, 'reference')
            : null
        ),
        children.length && !seen.has(system.id)
          ? h(
              'ul',
              { role: 'group' },
              children.map(n => branch(n.child, [...viaIds, n.id], new Set([...seen, system.id])))
            )
          : null
      )
    }
    const library = project.library()
    fill(
      this.content,
      h(
        'ul',
        { class: 'top', role: 'tree', 'aria-label': 'Systems' },
        branch(project.root, [], new Set())
      ),
      library.length ? h('h2', null, 'Library') : null,
      library.length
        ? h(
            'ul',
            { class: 'top' },
            library.map(s =>
              h(
                'li',
                null,
                h(
                  'button',
                  {
                    'aria-current': String(
                      currentPath.length === 1 && currentPath[0].systemId === s.id
                    ),
                    onclick: () => strata.nav.enter(s),
                  },
                  s.name,
                  h('small', null, s.levelTag ?? '')
                )
              )
            )
          )
        : null
    )
  }

  /** Navigates from the root through a chain of composite nodes. @param {string[]} viaIds */
  #go(viaIds) {
    const strata = /** @type {any} */ (this.strata)
    const path = strata.nav.toJSON()
    const same =
      path.length === viaIds.length + 1 && viaIds.every((id, i) => path[i + 1]?.viaNodeId === id)
    if (same) return
    // Reuse the common prefix, then go down.
    let common = 0
    while (common < viaIds.length && path[common + 1]?.viaNodeId === viaIds[common]) common++
    if (path[0].systemId !== strata.project.root.id) {
      strata.nav.home()
      common = 0
    } else for (let n = path.length - 1; n > common; n--) strata.nav.up()
    for (const id of viaIds.slice(common)) strata.nav.enter(strata.project.node(id))
  }
}

define('strata-tree', StrataTree)
