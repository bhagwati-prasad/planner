// @ts-check
/**
 * Snapshot migration v3 → v4: boundary ports carry the method bindings of the system's owner
 * (ADR 0010), and edges name the method they call (ADR 0011). A version-3 boundary port has no
 * bindings yet, and a version-3 edge names no method. Pure: the input is not changed.
 */

/**
 * @param {Record<string, any>} snapshot  a version-3 snapshot
 * @returns {Record<string, any>} the version-4 snapshot
 */
export function v3ToV4(snapshot) {
  return {
    ...snapshot,
    schemaVersion: 4,
    project: snapshot.project && { ...snapshot.project, schemaVersion: 4 },
    boundaryPorts: (snapshot.boundaryPorts ?? []).map(bp => ({ ...bp, bindings: {} })),
    edges: (snapshot.edges ?? []).map(edge => ({ ...edge, method: null })),
  }
}
