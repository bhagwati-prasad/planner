/**
 * Component discovery for the local server (spec §7 "Loading paths": "strata serve scans
 * components/*\/manifest.json, packs on the fly, watches for changes"). The catalog packs
 * every component folder in its directories and, when watching, repacks on change and tells
 * listeners which components changed.
 */
import { watch } from 'node:fs'
import { relative, sep } from 'node:path'
import { componentFolders, packFolder } from './folders.js'

/**
 * @typedef {object} CatalogEntry
 * @property {string} folder     absolute path
 * @property {string} name       folder name
 * @property {string|null} fileName  '<folder>.strata.js'
 * @property {import('../../strata-plugins/src/index.js').ComponentBundle|null} bundle  null when it has errors
 * @property {string|null} script
 * @property {import('../../strata-plugins/src/index.js').Problem[]} problems
 *
 * @typedef {{ action: 'added'|'changed'|'removed'|'failed', folder: string, typeRef: string|null }} CatalogChange
 */

export class ComponentCatalog {
  /** @type {Map<string, CatalogEntry>} */
  #entries = new Map()
  #dirs
  /** @type {import('node:fs').FSWatcher[]} */
  #watchers = []
  /** @type {Set<(changes: CatalogChange[]) => void>} */
  #listeners = new Set()
  #timer = null
  #scanning = Promise.resolve()

  /** @param {string[]} dirs directories that contain component folders */
  constructor (dirs) {
    this.#dirs = dirs
  }

  get dirs () { return [...this.#dirs] }

  /** Packs every component folder; returns what changed since the last scan. */
  scan () {
    const run = this.#scanning.then(() => this.#scan())
    this.#scanning = run.then(() => {}, () => {})
    return run
  }

  async #scan () {
    const folders = (await Promise.all(this.#dirs.map(componentFolders))).flat()
    /** @type {CatalogChange[]} */
    const changes = []
    const seen = new Set()
    for (const folder of folders) {
      seen.add(folder)
      const result = await packFolder(folder)
      const before = this.#entries.get(folder)
      /** @type {CatalogEntry} */
      const entry = { folder, name: folder.split(sep).pop() ?? folder, ...result }
      this.#entries.set(folder, entry)
      const typeRef = entry.bundle ? `${entry.bundle.manifest.id}@${entry.bundle.manifest.version}` : null
      if (!entry.bundle) {
        if (JSON.stringify(before?.problems) !== JSON.stringify(entry.problems)) changes.push({ action: 'failed', folder, typeRef })
      } else if (!before?.bundle) changes.push({ action: before ? 'changed' : 'added', folder, typeRef })
      else if (before.bundle.integrity !== entry.bundle.integrity) changes.push({ action: 'changed', folder, typeRef })
    }
    for (const [folder, entry] of this.#entries) {
      if (seen.has(folder)) continue
      this.#entries.delete(folder)
      changes.push({ action: 'removed', folder, typeRef: entry.bundle ? `${entry.bundle.manifest.id}@${entry.bundle.manifest.version}` : null })
    }
    return changes
  }

  /** Every component folder found, in folder order. */
  entries () {
    return [...this.#entries.values()]
  }

  /** @param {string} folder absolute path */
  get (folder) {
    return this.#entries.get(folder) ?? null
  }

  /**
   * Watches the directories and repacks after changes settle.
   * @param {{ debounce?: number }} [options]
   */
  watch ({ debounce = 120 } = {}) {
    if (this.#watchers.length) return
    const schedule = () => {
      clearTimeout(this.#timer)
      this.#timer = setTimeout(async () => {
        const changes = await this.scan()
        if (changes.length) for (const fn of this.#listeners) fn(changes)
      }, debounce)
    }
    for (const dir of this.#dirs) {
      try {
        this.#watchers.push(watch(dir, { recursive: true }, (event, file) => {
          if (file && /(^|[\\/])(\.|node_modules)|\.strata\.js$/.test(String(file))) return
          schedule()
        }))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
  }

  /** @param {(changes: CatalogChange[]) => void} fn @returns {() => void} */
  onChange (fn) {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }

  close () {
    clearTimeout(this.#timer)
    for (const w of this.#watchers) w.close()
    this.#watchers = []
    this.#listeners.clear()
  }

  /** Folder path relative to `root`, with POSIX separators. @param {string} folder @param {string} root */
  static relativeFolder (folder, root) {
    return relative(root, folder).split(sep).join('/')
  }
}
