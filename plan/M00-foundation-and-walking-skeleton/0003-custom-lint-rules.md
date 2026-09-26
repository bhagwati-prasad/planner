# 0003 Custom lint rules for the non-negotiables

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | todo | [0002](../M00-foundation-and-walking-skeleton/0002-dev-tooling.md) |

## Read first

- [Engineering §2 Non-negotiables](../../docs/guidelines/engineering/02-non-negotiables.md)
- [Engineering §6 Architecture and dependency rules](../../docs/guidelines/engineering/06-architecture-and-dependency-rules.md)
- [Engineering §11 Web Components and UI code](../../docs/guidelines/engineering/11-web-components-and-ui-code.md)
- [Engineering §14 Errors, async code and logging](../../docs/guidelines/engineering/14-errors-async-code-and-logging.md)
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)
- [Engineering §20 Documentation and decisions](../../docs/guidelines/engineering/20-documentation-and-decisions.md)

## Goal

In-house ESLint rules: import boundaries from the eng §6 table, banned globals per package, no dynamic `innerHTML`, no `eval` or `new Function` outside the sandbox bootstrap, no `console` in library code, no colour literals in component CSS, no floating promises, no committed `.only`, and help metadata on facade methods.

## Tests to write first

Write these tests first, in `tools/lint/test/*.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every rule has valid and invalid cases run through ESLint's RuleTester
- [ ] Importing `packages/core/src/model/*` from `packages/ui` fails; importing `packages/core/src/index.js` from `packages/facade` passes
- [ ] `Math.random` fails in `packages/sim` and passes in `packages/ui`
- [ ] A hex colour in a component `.css` file fails
- [ ] `it.only` fails lint

## Notes

- Floating-promise detection can be heuristic; document its limits in `tools/lint/README.md`.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
