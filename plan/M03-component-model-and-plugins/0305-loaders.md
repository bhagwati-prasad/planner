# 0305 Registration and upload loaders

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | todo | [0304](../M03-component-model-and-plugins/0304-pack-cli.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Loading paths

## Goal

`Strata.registerComponent()` for script tags, upload of zip or `.strata.js` with the in-browser packer, and a storage port that uses the in-memory adapter until M06.

## Tests to write first

Write these tests first, in `packages/plugins/test/loaders.test.js`, `tests/e2e/loaders.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A page from `file://` with two component script tags registers both, and no behaviour code runs on the page
- [ ] Uploading a zip of a component folder produces the same bundle as the CLI
- [ ] A malformed upload shows a validation error and registers nothing

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
