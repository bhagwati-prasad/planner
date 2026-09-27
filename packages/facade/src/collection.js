/**
 * Every collection the facade returns is a Collection: an Array with `toTable()` for
 * `console.table` (spec §16) and a few lookup helpers.
 */
export class Collection extends Array {
  /** map, filter, slice and friends return plain arrays. */
  static get [Symbol.species]() {
    return Array
  }

  // Collection.from(iterable) and Collection.of(...items) are inherited: called on a
  // subclass, Array.from and Array.of construct that subclass.

  /**
   * Rows for `console.table(collection.toTable())`.
   * @example console.table(root.nodes().toTable())
   */
  toTable() {
    return Array.from(this, item =>
      item && typeof item.toRow === 'function' ? item.toRow() : item
    )
  }

  /**
   * Ids of the items that have one.
   * @example root.nodes().ids()
   */
  ids() {
    return Array.from(this, item => item?.id).filter(Boolean)
  }

  /**
   * The item with this id or name, or undefined.
   * @param {string} idOrName
   * @example root.nodes().get('Orders')
   */
  get(idOrName) {
    return this.find(item => item?.id === idOrName) ?? this.find(item => item?.name === idOrName)
  }
}
