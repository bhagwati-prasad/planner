# 20. Documentation and decisions

- Every export has JSDoc with a description, parameters, return value, error codes and an example.
- Every facade method also carries `help` metadata (summary, signature, example), which powers `strata.help()`. Missing metadata fails lint. **(lint)**
- Every package README covers purpose, public API, allowed dependencies and how to run its tests.
- ADRs use MADR in `docs/adr/NNNN-kebab-title.md`. They are required for decisions about architecture, file formats, the plugin API, dependencies and security.
- This document and the UI/UX Design System live in `docs/guidelines/` and change only through an ADR.

---
Part of the [Strata Engineering Guidelines](README.md).
