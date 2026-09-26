---
description: Review changes against the task, the tests and the guidelines without editing code
argument-hint: [commit-range]
---
Review the uncommitted changes, or the commit range "$ARGUMENTS" if one was given. Do not edit any files.

Check, and report each finding with file and line:

1. Tests: does every test listed in the task exist, and does it assert what the task describes? Was any test weakened, skipped, deleted or marked `.only`?
2. Non-negotiables in docs/guidelines/engineering/02-non-negotiables.md, including package import boundaries and banned globals.
3. Commands: are all model changes commands with correct inverses? Are payloads JSON-safe?
4. Determinism: any wall clock, `Math.random` or uncontrolled promise in core or simulation code?
5. Units stored canonically; errors are StrataError with registered codes.
6. JSDoc on exports and help metadata on facade methods.
7. UI: tokens only, keyboard access, accessibility and reduced motion per the design system.

End with two lists: "Blocking" (must fix before commit) and "Suggestions".
