# 0304 strata pack

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | done | [0005](../M00-foundation-and-walking-skeleton/0005-bundler.md), [0302](../M03-component-model-and-plugins/0302-registry.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Packed bundle, Loading paths

## Goal

`strata pack <dir>`, `--all`, `--watch` and `--install <html>`, producing the `.strata.js` format with modules as source text and an integrity hash.

## Tests to write first

Write these tests first, in `packages/cli/test/pack.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Packing a multi-file component produces one file that registers the manifest, inline icon and all modules
- [x] `--install` inserts exactly one script tag between the markers and is idempotent
- [x] Packing the same folder twice gives byte-identical output

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
