# 0002 Formatting, lint and type-check tooling

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | todo | [0001](../M00-foundation-and-walking-skeleton/0001-repo-scaffold.md) |

## Read first

- [Engineering §4 Language and modules](../../docs/guidelines/engineering/04-language-and-modules.md)
- [Engineering §5 Code style](../../docs/guidelines/engineering/05-code-style.md)
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

Configure Prettier, ESLint and `tsc --noEmit --checkJs` with the style rules, pin exact dev-dependency versions, and add the npm scripts `format`, `format:check`, `lint` and `typecheck`.

## Tests to write first

Write these tests first, in `tools/test/tooling.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A fixture with bad formatting fails `npm run format:check`
- [ ] A fixture using `var` or `==` fails `npm run lint`
- [ ] A fixture with a JSDoc type error fails `npm run typecheck`
- [ ] `package-lock.json` pins exact versions and `npm ci --ignore-scripts` succeeds

## Notes

- Only the dev dependencies approved in eng §16 are allowed. Keep failing fixtures in `tools/test/fixtures/` and exclude them from normal runs.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] Every check that exists so far passes (`npm run check` arrives in task 0007)
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
