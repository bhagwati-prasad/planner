# 0119 Core within its size budget

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | proposed | [0118](../M01-core/0118-open-as-system.md) |

Proposed by 0118, under the policy the human chose on 2026-09-27 (`tools/ci/README.md`): 0118 took core, facade and the non-UI packages to 250.7 KB of their 250 KB budget and recorded an exception owned by this task. It awaits the human's approval, and the approach below is a proposal.

## Read first

- [Engineering §15 Performance budgets](../../docs/guidelines/engineering/15-performance-budgets.md)
- [tools/ci/README.md](../../tools/ci/README.md): the size gate and its exceptions

## Goal

Core, facade and the non-UI packages measure within 250 KB again, and the exception is removed. The proposed lever is the in-house minifier shortening local variable and parameter names, which it keeps whole today: most of what the bundles ship is identifier text.

## Tests to write first

Write these tests first, in `packages/plugins/test/minify.test.js` and `tools/test/ci.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Local variables and parameters get short names, while exported names, properties and globals keep theirs
- [ ] Every snippet, and the whole repository's bundles, behave the same before and after renaming
- [ ] Core, facade and the non-UI packages measure under 250 KB, and the size gate passes without their exception

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
