# 16. Governance

- The design system is versioned with the app and lives in `docs/guidelines/`. Changes need an ADR.
- A new component proposal covers its use case, anatomy, states, tokens, keyboard behaviour, accessibility notes and examples in light, dark and contrast themes.
- New tokens are added only when an existing token cannot express the need. Components never use one-off values.
- Stratum and status colours are reserved for their purposes and are never used as decoration.

## UI review checklist

- [ ] Uses tokens only; correct in light, dark and contrast themes.
- [ ] Every number shows a unit and, in the inspector, its source.
- [ ] Fully keyboard-operable with a visible focus ring; announced correctly by a screen reader.
- [ ] Colour is never the only carrier of meaning.
- [ ] Works at 200% zoom and in compact and touch densities.
- [ ] Motion answers an action and respects reduced motion.
- [ ] Copy is sentence case, uses the terminology table and names actions with verbs.
- [ ] Depth is clear: level, breadcrumb and layered-component markers are correct.
- [ ] Empty, loading, error and offline states are designed.
- [ ] Runnable states are designed: playing, paused, paused with run-only changes, out of scope and stubbed.

---
Part of the [Strata UI/UX Design System](README.md).
