# 21. Security, non-functional requirements and resolved questions

Component code is treated as untrusted, user content is sanitised everywhere, and secrets never leave the machine in R0–R3. All eight open questions are resolved with the proposed defaults.

## Security

- **Sandbox:** stripped worker globals, seeded randomness, simulated clock and a heartbeat watchdog (§8).
- **Integrity:** each pinned bundle carries a SHA-256 hash checked on load; the R5 registry signs bundles.
- **Content:** Markdown in docs and comments passes an in-house allowlist sanitiser; no inline scripts in rendered content.
- **Served mode:** the local server binds to localhost only and sends a strict Content Security Policy.
- **Secrets:** AI keys live in local storage only and are excluded from `.strata` exports.
- **SaaS:** tenant isolation, encryption at rest and in transit, audit logs, SSO enforcement.

## Non-functional requirements

| Area | Target |
| --- | --- |
| Canvas | 60 fps pan and zoom with 500 visible nodes; usable at 2,000 nodes per view |
| Startup | Offline app interactive in under 2 s; core + UI under 600 KB minified, excluding D3; Three.js lazy-loaded |
| Simulation | ≥ 200,000 events/s; 500 components × 1,000 req/s × 60 s in under 10 s |
| Stepping and scrubbing | One step back or forward within 100 ms; any scrub within 300 ms for a 60 s run |
| Snapshots | At most 10% of simulation throughput |
| Persistence | Commands flushed within 500 ms; no loss on tab crash |
| Recursion | Unlimited depth; tested to 10 levels |
| Browsers | Latest two versions of Chrome, Edge, Firefox and Safari; `file://` fully supported on Chromium and Firefox, best-effort on Safari |
| Accessibility | WCAG 2.2 AA for panels; canvas keyboard navigation (Tab through nodes, arrows to move, Enter to drill down) |
| Localisation | English only; all strings externalised for later translation |
| Node | Node 20+ for CLI and headless use; zero npm runtime dependencies |

## Resolved questions

| Question | Decision |
| --- | --- |
| Design guidelines | Both: the app offers an engineering guidelines template and a UI/UX design system template |
| sessionStorage role | Confirmed: per-tab working state and crash recovery; IndexedDB holds the projects |
| Real-time sync library | Built in-house in vanilla JS for R4; no Yjs |
| CLI dependency | Node 20+ is required for `strata pack`; the in-browser upload packer remains the fallback |
| Product name | Strata |
| Cost modelling | Generic price properties only; no bundled cloud-provider price tables |
| Licensing | Proprietary until revisited before the first public release; vendored D3 (ISC), Three.js (MIT) and IBM Plex fonts (OFL) keep their own licences |
| Component authoring language | JavaScript only, typed with JSDoc; `strata pack` does not strip TypeScript |

---
Part of the [Strata Product and Technical Specification](README.md).
