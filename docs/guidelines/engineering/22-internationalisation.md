# 22. Internationalisation

- All user-facing strings live in `packages/ui/i18n/en.json` under dotted keys, such as `inspector.properties.resetToDefault`.
- Messages use ICU-style placeholders and plurals. Sentences are never built by concatenation.
- Numbers, dates, durations and units are formatted only through `ui/format.js`, which implements the design system's formatting rules on top of `Intl`.
- Core error codes map to message keys. Core code contains developer messages but no user-facing English.

---
Part of the [Strata Engineering Guidelines](README.md).
