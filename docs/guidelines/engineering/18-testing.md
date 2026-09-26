# 18. Testing

| Level | Tool | Scope | Target |
| --- | --- | --- | --- |
| Unit | `node:test`, `node:assert/strict` | Pure logic in core, sim, docs, plan, comments, storage | Lines 90% in core, 85% in sim, 80% elsewhere |
| Property | In-house generators in `tools/testing/gen.js` | Command inverse round-trips; export and import round-trips; `inline(extract(x))` equals `x`; stepping forward n then back n restores the same state hash | Every command, format and step unit |
| Contract | Shared suites in `tools/contracts/` | Adapters and the plugin API | Every implementation |
| Determinism | Node and browser worker | Same fixture and seed give the same run hash in V8, SpiderMonkey and JavaScriptCore | Every simulation feature |
| Simulation controls | Headless facade tests | Every control and step unit on the recursive fixture, including scoped runs, stubs, edits while paused and branches | Every control |
| Component | Playwright in Chromium, Firefox and WebKit | Custom elements in isolation | Every element |
| End-to-end | Playwright | Each release's exit criteria, run both served and from `file://` | Every release |
| Visual | Playwright screenshots | Canvas fixtures in light, dark and contrast themes | 0.1% pixel threshold |
| Accessibility | axe-core and keyboard-only scripts | Every panel; core flows without a mouse | Zero serious violations |
| Performance | `tools/bench/` | Budgets in §15 | No regression over 10% |

## Test conventions

- Name tests after behaviour: `describe('system.extract')`, then `it('creates one boundary port per crossing edge')`.
- Fixtures are `.strata` files in `test/fixtures/`, versioned with the schema.
- Build state through commands or fixture loading, never by hand-assembling state objects.
- No sleeps and no real timers; use the fake scheduler.

---
Part of the [Strata Engineering Guidelines](README.md).
