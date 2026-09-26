# 14. Errors, async code and logging

## Errors

- All thrown errors are `StrataError` instances with `code`, `message` (for developers), `userMessageKey` (an i18n key), `details` (plain data) and an optional `cause`.
- Codes live in `core/src/errors/codes.js`, each with a one-line description. Codes are stable and never reused.
- Validation returns `ok()` or `err(code, details)` and does not throw. Throwing is reserved for programmer errors and unexpected failures.
- User-facing text follows the design system's error pattern: what happened, why, and how to fix it.

## Async code

- Every promise is awaited or explicitly handed to an error handler. Floating promises fail lint. **(lint)**
- Long operations (simulation runs, exports, packing, AI calls) accept an `AbortSignal` and stop promptly when it fires.
- Tests never sleep. They drive time with the fake scheduler and fake clock.

## Logging and privacy

- Library code logs only through the injected logger (`debug`, `info`, `warn`, `error`). **(lint)**
- The CLI maps the logger to stderr; `--verbose` enables debug output.
- Strata sends no telemetry. Nothing leaves the machine except through an explicit user action: an export, an AI call with the user's own key, or R4 sync.

---
Part of the [Strata Engineering Guidelines](README.md).
