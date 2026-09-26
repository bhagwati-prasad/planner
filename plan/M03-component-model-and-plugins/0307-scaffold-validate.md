# 0307 strata new component, validate and test-component

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | todo | [0303](../M03-component-model-and-plugins/0303-behaviour-contract.md), [0304](../M03-component-model-and-plugins/0304-pack-cli.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md)
- [Engineering §10 Plugins and components](../../docs/guidelines/engineering/10-plugins-and-components.md)
- [Design system §13 Iconography](../../docs/guidelines/design-system/13-iconography.md)

## Goal

`strata new component <name> [--extends base:x]`, `strata validate <dir>` (manifest, behaviour contract, icon rules, determinism checks) and `strata test-component <dir>`.

## Tests to write first

Write these tests first, in `packages/cli/test/scaffold.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A scaffolded component validates and its generated self-test passes
- [ ] An icon with a raster image, a script or more than 4 KB fails validation
- [ ] A behaviour awaiting a non-ctx promise is flagged

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
