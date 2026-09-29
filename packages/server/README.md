# strata-server

The local server behind `strata serve`: static files under a strict CSP, component discovery and live reload.

- Runs in: Node
- Specification: spec §8, §21
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`

## Security (eng §16 "Local server")

- **Binding.** It binds to a loopback address only.
- **Host and Origin.** It refuses a request whose `Host` header is not local, which blocks DNS rebinding. It also refuses one whose `Origin` is not its own origin, which blocks cross-site requests.
- **Session token.** Every page it serves comes with a random per-session token, as a `strata-session` cookie (`HttpOnly`, `SameSite=Strict`). API calls without the token are refused. `/api/health` needs no token, and answers only `{ "ok": true }`.
- **Requests.** It serves only GET and HEAD, never lists directories, never serves dotfiles and never leaves its root.
- **CSP.** It sends exactly the policy of eng §16, which allows no inline scripts or styles. The UI elements and strata-graph adopt constructable stylesheets, and the pages link their CSS.
