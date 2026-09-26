/**
 * The shell's actions (spec §9: command palette, keyboard shortcuts). Every action is
 * available from the command palette; many also sit in the context menu, the toolbar or a
 * shortcut. They act through the strata facade, and through the canvas for view operations.
 */

/** @typedef {import('./shell.js').Shell} Shell */

const MOD = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⌘' : 'Ctrl'

/**
 * Keyboard shortcut string for an event, e.g. 'Ctrl+Shift+Z' (⌘ counts as Ctrl).
 * @param {KeyboardEvent} event
 */
export function shortcutOf(event) {
  // Digits come from the physical key so Shift+1 reads the same on every layout.
  let key = /^Digit[0-9]$/.test(event.code ?? '') ? event.code.slice(5) : event.key
  if (key.length === 1) key = key.toUpperCase()
  const parts = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  // Shift counts for letters, digits and named keys, not for symbols it produced (e.g. '?').
  if (event.shiftKey && (/^[A-Z0-9]$/.test(key) || key.length > 1)) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/** How a shortcut is shown to people on this platform. @param {string} shortcut */
export const displayShortcut = shortcut => shortcut.replace(/^Ctrl/, MOD)

/** @param {Shell} shell */
export function registerDefaultActions(shell) {
  const s = shell.strata
  const project = () => s.project
  const current = () => /** @type {any} */ (s.project?.nav.current)
  const writable = () => !!s.project && !current().readOnly
  const nodeIds = () => shell.selectedModelIds.filter(id => isNode(id))
  const isNode = id => {
    try {
      return current()
        .nodes()
        .some(n => n.id === id)
    } catch {
      return false
    }
  }
  const single = () => {
    const ids = nodeIds()
    return ids.length === 1 ? project().node(ids[0]) : null
  }
  const canvas = () => shell.canvas
  const add = action => shell.registerAction(action)

  // Edit
  add({
    id: 'edit.undo',
    title: 'Undo',
    group: 'Edit',
    shortcut: 'Ctrl+Z',
    enabled: () => !!project()?.canUndo,
    run: () => project().undo(),
  })
  add({
    id: 'edit.redo',
    title: 'Redo',
    group: 'Edit',
    shortcut: 'Ctrl+Shift+Z',
    enabled: () => !!project()?.canRedo,
    run: () => project().redo(),
  })
  add({
    id: 'edit.copy',
    title: 'Copy',
    group: 'Edit',
    shortcut: 'Ctrl+C',
    enabled: () => nodeIds().length > 0,
    run: () => {
      const clip = s.copy(nodeIds())
      shell.notify(`Copied ${clip.nodes.length} node${clip.nodes.length === 1 ? '' : 's'}`)
    },
  })
  add({
    id: 'edit.paste',
    title: 'Paste',
    group: 'Edit',
    shortcut: 'Ctrl+V',
    enabled: () => !!s.clipboard && writable(),
    run: (sh, context) => {
      const pasted = s.paste({ into: current(), at: context?.at ?? canvas()?.freeSpot?.() })
      sh.select(pasted.ids())
      if (pasted.skipped?.length)
        sh.notify(
          `Skipped ${pasted.skipped.map(x => `${x.name} (${x.reason})`).join(', ')}`,
          'error'
        )
    },
  })
  add({
    id: 'edit.duplicate',
    title: 'Duplicate',
    group: 'Edit',
    shortcut: 'Ctrl+D',
    enabled: () => nodeIds().length > 0 && writable(),
    run: sh => sh.select(s.duplicate(nodeIds()).ids()),
  })
  add({
    id: 'edit.delete',
    title: 'Delete selection',
    group: 'Edit',
    enabled: () => shell.selection.length > 0 && writable(),
    run: sh => canvas()?.intent({ type: 'delete', ids: sh.selection }),
  })
  add({
    id: 'edit.selectAll',
    title: 'Select all',
    group: 'Edit',
    enabled: () => !!project(),
    run: sh => sh.select([...current().nodes().ids(), ...current().edges().ids()]),
  })
  add({
    id: 'edit.rename',
    title: 'Rename…',
    group: 'Edit',
    shortcut: 'F2',
    enabled: () => !!single() && writable(),
    run: sh => sh.inspect(/** @type {any} */ (single()).id, { focus: 'name' }),
  })

  // Structure (spec §6)
  add({
    id: 'structure.extract',
    title: 'Extract selection as system',
    group: 'Structure',
    shortcut: 'Ctrl+G',
    enabled: () => nodeIds().length > 0 && writable(),
    run: sh => {
      const child = current().extract(nodeIds(), {})
      sh.select([child.via.id])
      sh.notify(
        `Extracted into '${child.name}'. Double-click to enter it; rename it in the inspector.`,
        'success'
      )
    },
  })
  add({
    id: 'structure.inline',
    title: 'Inline system',
    group: 'Structure',
    shortcut: 'Ctrl+Shift+G',
    enabled: () => !!single()?.isComposite && writable(),
    run: sh => sh.select(current().inline(single()).ids()),
  })
  add({
    id: 'structure.detach',
    title: 'Make an editable copy (detach reference)',
    group: 'Structure',
    enabled: () => single()?.placement === 'reference' && writable(),
    run: sh => {
      single().detach()
      sh.notify('The composite now holds its own editable copy', 'success')
    },
  })
  add({
    id: 'structure.newSystem',
    title: 'New library system',
    group: 'Structure',
    enabled: () => !!project(),
    run: sh => {
      const names = new Set(
        project()
          .systems()
          .map(x => x.name)
      )
      let name = 'New system'
      for (let i = 2; names.has(name); i++) name = `New system ${i}`
      project().createSystem(name, { levelTag: 'container' })
      sh.notify(
        `Created library system '${name}'. Drag it from the library to place it.`,
        'success'
      )
    },
  })

  // Navigation (spec §6 "Drill-down")
  add({
    id: 'nav.enter',
    title: 'Enter composite',
    group: 'Navigate',
    enabled: () => !!single()?.isComposite,
    run: () => canvas()?.enter(/** @type {any} */ (single()).id),
  })
  add({
    id: 'nav.up',
    title: 'Up one level',
    group: 'Navigate',
    shortcut: 'Backspace',
    enabled: () => (project()?.nav.depth ?? 0) > 0,
    run: () => s.nav.up(),
  })
  add({
    id: 'nav.home',
    title: 'Go to the root system',
    group: 'Navigate',
    shortcut: 'Alt+Home',
    enabled: () => (project()?.nav.depth ?? 0) > 0,
    run: () => s.nav.home(),
  })
  add({
    id: 'nav.find',
    title: 'Find a node…',
    group: 'Navigate',
    shortcut: 'Ctrl+F',
    enabled: () => !!project(),
    run: sh => sh.openPalette('find'),
  })
  add({
    id: 'palette.add',
    title: 'Add a component…',
    group: 'Edit',
    shortcut: 'Shift+A',
    enabled: () => writable(),
    run: sh => sh.openPalette('add'),
  })

  // View
  add({
    id: 'view.fit',
    title: 'Fit diagram',
    group: 'View',
    shortcut: 'Shift+1',
    enabled: () => !!canvas(),
    run: () => canvas().graph.fit({ animate: !shell.reducedMotion }),
  })
  add({
    id: 'view.zoomSelection',
    title: 'Zoom to selection',
    group: 'View',
    shortcut: 'Shift+2',
    enabled: () => !!canvas() && shell.selection.length > 0,
    run: sh => canvas().graph.zoomTo(sh.selection, { animate: !shell.reducedMotion }),
  })
  add({
    id: 'view.theme',
    title: 'Toggle dark theme',
    group: 'View',
    run: sh => sh.emit('toggle-theme'),
  })
  for (const routing of ['orthogonal', 'straight', 'curved']) {
    add({
      id: `view.routing.${routing}`,
      title: `Route edges: ${routing}`,
      group: 'View',
      enabled: () => !!canvas(),
      run: () => canvas().graph.setOptions({ routing }),
    })
  }
  add({
    id: 'view.newPage',
    title: 'New page (view) of this system',
    group: 'View',
    enabled: () => writable(),
    run: () => canvas()?.newPage(),
  })

  // Arrange (spec §9)
  const arrange = (id, title, fn, min) =>
    add({
      id,
      title,
      group: 'Arrange',
      enabled: () => !!canvas() && nodeIds().length >= min && writable(),
      run: () => fn(canvas().graph),
    })
  arrange('arrange.left', 'Align left', g => g.align('left'), 2)
  arrange('arrange.center', 'Align centres', g => g.align('center'), 2)
  arrange('arrange.right', 'Align right', g => g.align('right'), 2)
  arrange('arrange.top', 'Align top', g => g.align('top'), 2)
  arrange('arrange.middle', 'Align middles', g => g.align('middle'), 2)
  arrange('arrange.bottom', 'Align bottom', g => g.align('bottom'), 2)
  arrange('arrange.distributeH', 'Distribute horizontally', g => g.distribute('horizontal'), 3)
  arrange('arrange.distributeV', 'Distribute vertically', g => g.distribute('vertical'), 3)

  // Export (spec C14: PNG, SVG)
  add({
    id: 'export.svg',
    title: 'Export SVG',
    group: 'Export',
    enabled: () => !!canvas(),
    run: () => canvas().download('svg'),
  })
  add({
    id: 'export.png',
    title: 'Export PNG',
    group: 'Export',
    enabled: () => !!canvas(),
    run: () => canvas().download('png'),
  })

  // Help
  add({
    id: 'help.shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Help',
    shortcut: '?',
    run: sh => sh.emit('help'),
  })
  add({
    id: 'palette.commands',
    title: 'Command palette',
    group: 'Help',
    shortcut: 'Ctrl+K',
    run: sh => sh.openPalette('commands'),
  })
}
