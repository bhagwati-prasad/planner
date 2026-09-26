# 0306 strata serve

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | todo | [0304](../M03-component-model-and-plugins/0304-pack-cli.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Loading paths
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md): Local server

## Goal

A zero-dependency local server that serves the app, scans `components/`, watches for changes and serves `/api/components`, with localhost binding, Host and Origin checks, a session token and the strict CSP.

## Tests to write first

Write these tests first, in `packages/server/test/serve.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Adding a component folder while running makes it appear in `/api/components` without restart
- [ ] Requests with a foreign `Host` or `Origin` header are rejected
- [ ] API calls without the session token are rejected
- [ ] Responses carry the CSP from eng §16

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
