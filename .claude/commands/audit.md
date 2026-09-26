---
description: Audit one package against the engineering guidelines and design system
argument-hint: <package-name>
---
Audit `packages/$ARGUMENTS` against docs/guidelines/engineering/ (and docs/guidelines/design-system/ if it is a UI package). Do not edit code.

Report:
1. Violations of the non-negotiables and dependency rules.
2. Public APIs missing JSDoc, help metadata or tests.
3. Test gaps: behaviour described in the linked spec sections that no test covers.
4. Code that has drifted from the spec, with the spec section it contradicts.
5. Performance risks against docs/guidelines/engineering/15-performance-budgets.md.

Finish with proposed follow-up tasks in the plan/TASK_TEMPLATE.md format. Do not add them to the roadmap until the human agrees.
