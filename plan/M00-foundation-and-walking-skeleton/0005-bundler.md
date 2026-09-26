# 0005 In-house zero-dependency bundler

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | done | [0001](../M00-foundation-and-walking-skeleton/0001-repo-scaffold.md) |

## Read first

- [Spec §4 System architecture](../../docs/spec/04-system-architecture.md): Build
- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Packed bundle
- [Engineering §4 Language and modules](../../docs/guidelines/engineering/04-language-and-modules.md)

## Goal

Bundle an ES-module graph with relative imports into an IIFE with a configurable global, into CommonJS, and into the packed component format with modules as source text.

## Tests to write first

Write these tests first, in `packages/plugins/test/bundler.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A three-file fixture bundles to an IIFE that runs in a `vm` context and exposes the expected global
- [x] The same fixture bundles to CommonJS that Node can `require`
- [x] Circular imports behave like ES modules for the supported subset
- [x] Bare specifiers other than `d3` and `three` fail with `E_BUNDLE_BARE_SPECIFIER`
- [x] Output is byte-identical across two runs

## Out of scope

- Dynamic `import()`, top-level `await`, source maps.

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
