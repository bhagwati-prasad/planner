# 16. Security

Treat as untrusted: imported `.strata` files, uploaded component bundles, pasted content, Markdown in docs and comments, and anything read from a server.

## Input handling

- Imports are schema-validated before anything is loaded. Limits: 50 MB uncompressed, JSON nesting depth 64, 1 MB per string.
- Rendered Markdown passes the in-house allowlist sanitiser. It strips event-handler attributes, `style` attributes, `javascript:` URLs and any tag outside the allowlist.

## Code execution

- `eval`, `new Function` and string arguments to timers are banned everywhere except the sandbox worker bootstrap. **(lint)**
- Component code runs only in the sandbox worker, loaded from a Blob URL before the worker strips its globals (spec §8).
- A bundle whose integrity hash does not match is refused and rendered as a missing-component placeholder.

## Local server

- Binds to `127.0.0.1` only.
- Rejects requests whose `Host` or `Origin` header is not the local origin, which blocks DNS rebinding and cross-site requests.
- API calls carry a random per-session token issued when the app loads.
- Sends a strict CSP: `default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'`.

## Secrets and dependencies

- AI provider keys are stored only in localStorage, never in exports, logs or error details.
- Runtime dependencies are limited to vendored D3 and Three.js, each pinned by SHA-256.
- Dev dependencies come from an approved list (Prettier, ESLint, TypeScript for type-checking, Playwright, axe-core). They are pinned to exact versions and installed with `npm ci --ignore-scripts`.

---
Part of the [Strata Engineering Guidelines](README.md).
