# 1601 AI provider adapters

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M16 AI assistance](../ROADMAP.md#m16-ai-assistance) | R2 | todo | [1303](../M13-docs-engine/1303-live-bindings.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): AI assistance
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md): Secrets and dependencies

## Goal

One provider interface with Anthropic, OpenAI and Ollama adapters, keys held only in localStorage, and a local-server proxy when CORS blocks direct calls.

## Tests to write first

Write these tests first, in `packages/docs/test/ai-providers.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Keys never appear in exports, logs or error details
- [ ] Each adapter passes a contract suite against a recorded mock server
- [ ] Without a key, AI actions are hidden rather than broken

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
