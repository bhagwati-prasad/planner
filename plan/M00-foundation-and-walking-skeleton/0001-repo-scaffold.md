# 0001 Repository scaffold and npm workspaces

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | done | none |

## Read first

- [Engineering §3 Repository layout](../../docs/guidelines/engineering/03-repository-layout.md)
- [Engineering §4 Language and modules](../../docs/guidelines/engineering/04-language-and-modules.md)

## Goal

Create the monorepo layout from the guidelines: npm workspaces, one package per row of the package table, each with src/index.js, test/, README.md and a private package.json with no dependencies.

## Tests to write first

Write these tests first, in `tools/test/scaffold.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Every package listed in eng §3 exists with `src/index.js`, `test/`, `README.md` and `package.json`
- [x] No `package.json` under `packages/` declares `dependencies`
- [x] `npm test` discovers tests under `packages/*/test`, `tools/**/test` and `components/*/tests` and exits 0

## Notes

- Write the scaffold test first; it must fail on the empty repository.

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] Every check that exists so far passes (`npm run check` arrives in task 0007)
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
