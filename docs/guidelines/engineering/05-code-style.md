# 5. Code style

Formatting is automated with Prettier; style rules beyond formatting are enforced by ESLint and review.

| Aspect | Rule |
| --- | --- |
| Formatting | 2-space indent, no semicolons, single quotes, trailing commas on multi-line literals, 100-character lines |
| Variables | `const` by default, `let` when reassigned, never `var`; `===` except `== null` |
| Functions | Pure where possible; aim for 40 lines or fewer; cyclomatic complexity 10 or less **(lint, warning)** |
| Files | Aim for 400 lines or fewer; split by responsibility, not by type |
| Classes | Only for long-lived stateful objects: command bus, kernel, custom elements, adapters |
| Comments | Explain why, not what; every export has JSDoc (§20) |

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | kebab-case | `command-bus.js` |
| Functions, variables | camelCase | `resolveSystem` |
| Classes, typedefs | PascalCase | `CommandBus`, `NodeEntity` |
| True constants | UPPER_SNAKE_CASE | `MAX_DEPTH` |
| Booleans | `is`, `has`, `can` prefixes | `isComposite` |
| Private members | `#` private fields | `#queue` |
| Commands | `<domain>.<verb>` | `node.add`, `system.extract`, `thread.resolve` |
| Core events | `<domain>.<past participle>` | `node.added`, `system.extracted` |
| DOM events | `strata:<noun>-<past participle>` | `strata:selection-changed` |
| Custom elements | `strata-<name>` | `strata-inspector` |
| CSS custom properties | `--st-<category>-<name>` | `--st-color-text-primary` |
| Error codes | `E_<AREA>_<REASON>` | `E_SYSTEM_CYCLE` |
| Metrics and props | camelCase; unit in the schema, not the name | `deliveryDelay` with `"unit": "ms"` |

---
Part of the [Strata Engineering Guidelines](README.md).
