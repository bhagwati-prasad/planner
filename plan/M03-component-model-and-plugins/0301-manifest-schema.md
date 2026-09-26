# 0301 Manifest schema

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | todo | [0107](../M01-core/0107-schema-validator.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md)
- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Manifest
- [Engineering §10 Plugins and components](../../docs/guidelines/engineering/10-plugins-and-components.md)

## Goal

Validate manifests: identity, `strataApi`, ports with `exposes`, properties, state, public and private methods, metrics, templates and migrations.

## Tests to write first

Write these tests first, in `packages/plugins/test/manifest.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The spec §8 example manifest validates
- [ ] A port exposing an undeclared method fails with `E_MANIFEST_UNKNOWN_METHOD`
- [ ] A state field without an initial value fails
- [ ] An unsupported `strataApi` range fails with a message naming the supported range

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
