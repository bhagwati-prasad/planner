# 0502 StrataElement base class and shell config

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0501](../M05-shell/0501-tokens-themes.md), [0115](../M01-core/0115-facade.md) |

## Read first

- [Engineering §11 Web Components and UI code](../../docs/guidelines/engineering/11-web-components-and-ui-code.md)
- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Swappable UI

## Goal

The base class (open shadow root, adopted token stylesheets, template cloning, auto-cleanup subscriptions) and `shell.json` mapping regions to elements.

## Tests to write first

Write these tests first, in `packages/ui/test/element.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Disconnecting an element releases every subscription and listener
- [ ] Swapping the inspector in `shell.json` changes the element with no code change
- [ ] No element sets a `style` attribute, so the served CSP needs no `unsafe-inline`

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
