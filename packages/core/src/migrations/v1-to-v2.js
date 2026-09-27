// @ts-check
/**
 * Snapshot migration v1 → v2 (ADR 0008): property values, and contract bounds on percentages,
 * move from the author's notation ('4d', percentages in points) to canonical units (eng §8). A value whose type the registry does
 * not know, or that does not check, is kept as written, and problem detection reports it. Pure:
 * the input is not changed.
 */
import { canonicalContract } from '../commands/project.js'
import { connectionTypeOf, manifestOf } from '../model.js'
import { checkValue } from '../schema.js'

/**
 * @param {import('../registry.js').EffectiveManifest|null} manifest
 * @param {Record<string, unknown>} props
 */
function canonical(manifest, props) {
  return Object.fromEntries(
    Object.entries(props ?? {}).map(([key, value]) => {
      const schema = manifest?.properties?.[key]
      const checked = schema ? checkValue(schema, value, key) : null
      return [key, checked?.ok ? checked.value : value]
    })
  )
}

/**
 * @param {Record<string, any>} snapshot  a version-1 snapshot
 * @param {{ registry: import('../registry.js').Registry }} context
 * @returns {Record<string, any>} the version-2 snapshot
 */
export function v1ToV2(snapshot, { registry }) {
  return {
    ...snapshot,
    schemaVersion: 2,
    project: snapshot.project && { ...snapshot.project, schemaVersion: 2 },
    systems: (snapshot.systems ?? []).map((/** @type {any} */ system) => ({
      ...system,
      contract: canonicalContract(system.contract ?? {}),
    })),
    nodes: (snapshot.nodes ?? []).map((/** @type {any} */ node) => ({
      ...node,
      props: canonical(manifestOf(registry, node), node.props),
    })),
    edges: (snapshot.edges ?? []).map((/** @type {any} */ edge) => ({
      ...edge,
      props: canonical(connectionTypeOf(registry, edge), edge.props),
    })),
  }
}
