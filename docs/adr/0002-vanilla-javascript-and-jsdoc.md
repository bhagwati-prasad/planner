# 0002 Vanilla JavaScript with JSDoc types

Status: Accepted
Date: 2026-09-26

## Context and problem

The app must run offline from `file://` with no build step for users, and the team is a human reviewer plus an AI agent.

## Decision outcome

Use vanilla JavaScript (ES2022 modules), HTML templates and Web Components, with D3.js and Three.js as the only runtime dependencies. Types come from JSDoc, checked with `tsc --checkJs` during development only. An in-house bundler produces the offline build and packs components. Components are authored in JavaScript only.

## Consequences

- Good: no framework churn, a small bundle and full control over offline loading.
- Bad: we build some things frameworks give for free, such as the bundler, schema validation and the UI base class.
- See engineering guidelines §4 and §16.
