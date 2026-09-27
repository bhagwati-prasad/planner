// @ts-check
/**
 * Snapshot migration v3 → v4 (ADR 0010): boundary ports carry the method bindings of the
 * system's owner, and a version-3 boundary port has none yet. Pure: the input is not changed.
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
  }
}
