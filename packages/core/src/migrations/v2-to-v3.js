// @ts-check
/**
 * Snapshot migration v2 → v3 (ADR 0009): every node is a typed component. A composite (no
 * type, `kind: 'composite'`, `systemRef`) becomes a `strata.system` component whose
 * `innerSystemRef` is the system it placed; an atomic node gains `innerSystemRef: null`. No node
 * keeps `kind` or `systemRef`. Pure: the input is not changed.
 */
import { SYSTEM_TYPE_REF } from '../builtins.js'

/** @param {Record<string, any>} node */
function typed({ kind, systemRef, ...node }) {
  return kind === 'composite'
    ? { ...node, typeRef: SYSTEM_TYPE_REF, innerSystemRef: systemRef }
    : { ...node, innerSystemRef: null, placement: node.placement ?? null }
}

/**
 * @param {Record<string, any>} snapshot  a version-2 snapshot
 * @returns {Record<string, any>} the version-3 snapshot
 */
export function v2ToV3(snapshot) {
  return {
    ...snapshot,
    schemaVersion: 3,
    project: snapshot.project && { ...snapshot.project, schemaVersion: 3 },
    nodes: (snapshot.nodes ?? []).map(typed),
  }
}
