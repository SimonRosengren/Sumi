# 33. Token management in the web UI

- Status: accepted
- Date: 2026-10-30

## Context

[ADR 0021](0021-github-sign-in-and-token-management.md) added `GET/POST /tokens` and `DELETE /tokens/:id` with `sumi token list|create|revoke`, and left the web UI for later ("use the CLI"). People who sign in with GitHub collect a token per sign-in and had no way to see or clean them up in the browser.

## Decision

- **An "API tokens" dialog**, opened from a key button in the header. It lists the signed-in human's tokens (public id, created time, newest first), creates one (the plaintext is shown once, with a Copy button, and is dropped when the dialog closes) and revokes one.
- **It uses the existing operations** (`listTokens`, `createToken`, `revokeToken`), already in `OPERATIONS` with CLI commands. MCP stays excluded: credentials are managed by people ([ADR 0029](0029-ui-features-exist-in-cli-and-mcp.md)). Only the signed-in human's own tokens are listed; an agent's tokens are still handled with `sumi token ... --user`.
- **The token this browser uses is marked "This browser".** The web app computes the token's public id the same way the server does (first 16 hex characters of its SHA-256, [ADR 0021](0021-github-sign-in-and-token-management.md)) with Web Crypto and compares. Revoking it reads "Revoke and sign out" and signs the browser out, since the next request would be rejected anyway. Where Web Crypto is missing (plain HTTP away from localhost) nothing is marked.

## Consequences

- No API, contract or database change.
- The web app now depends on the public id being a SHA-256 prefix. If that derivation changes, the marker silently stops working (nothing breaks); the web test for it would fail.
- Revoking in one place does not update another open tab until it makes a request and is rejected.
