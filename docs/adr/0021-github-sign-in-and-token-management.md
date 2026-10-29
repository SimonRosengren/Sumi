# 21. GitHub sign-in and token management

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0006](0006-github-oauth-and-integration.md) decided that humans sign in with GitHub. [ADR 0013](0013-api-token-authentication.md) left two gaps: tokens could not be listed or revoked, and a GitHub user would be a different user from the bootstrap human. The web app, CLI and MCP server all authenticate with `Authorization: Bearer <token>` through one client, and the board's live updates use a streaming `fetch` with that header ([ADR 0019](0019-sse-live-updates.md)).

## Decision

**GitHub sign-in produces a Sumi API token, not a cookie session.**

- `GET /auth/github` redirects to GitHub with a random `state` that is also stored in a short-lived `HttpOnly`, `SameSite=Lax` cookie. `GET /auth/github/callback` checks the state, exchanges the code (server side, with the client secret), reads the GitHub profile, finds or creates the human with that GitHub id (`core.users.signInWithGithub`), issues a normal API token for them and redirects the browser to `<SUMI_PUBLIC_URL>/#token=...`. The web app reads the fragment, stores the token as it does for a pasted one, and removes the fragment from the address bar. Failures redirect to `/#error=<message>`.
- Cookie sessions would need CSRF protection and a second authentication path in the API and client. Reusing tokens keeps one mechanism for every client. The fragment is never sent to a server and is cleared at once. The token stays in `localStorage` as before ([ADR 0017](0017-web-stack.md)), so any script on the page could read it; this is unchanged and now revocable.
- **An allow-list is required.** Anyone has a GitHub account, so sign-in is limited to the logins in `GITHUB_ALLOWED_LOGINS` (comma-separated, case-insensitive). Sign-in is enabled only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are both set, and the API refuses to start if they are set without an allow-list. Users are keyed by the stable GitHub id; the login is only checked at sign-in, so a user who renames themselves keeps access until the allow-list is updated, and a login that is released and re-registered by someone else would be admitted until it is removed.
- The callback URL is `<SUMI_PUBLIC_URL>/api/auth/github/callback`, because the browser reaches the API under `/api` ([ADR 0017](0017-web-stack.md)). That is the URL to register in the GitHub OAuth app. Scope is `read:user`.
- `GET /auth/config` (public) tells the sign-in screen whether GitHub sign-in is on. The token form always works.
- Each GitHub sign-in issues a new token. They accumulate until revoked.
- The first human can be created either with `pnpm bootstrap` or simply by signing in with GitHub. The bootstrap human is not linked to a GitHub identity; a person who uses both has two users.

**Tokens can be listed, created and revoked** (humans only, for themselves or an agent): `GET /tokens`, `POST /tokens`, `DELETE /tokens/:id`, `sumi token list|create|revoke`. A token's public id is the first 16 hex characters of its stored hash; it identifies a token but cannot authenticate. Revocation deletes the token and is recorded as `token.revoked`. This is also how an agent's leaked token is rotated.

## Consequences

- No new dependencies, and no change to how clients authenticate.
- The GitHub endpoints are exercised in tests against a fake GitHub; a real sign-in needs an OAuth app and has to be checked by hand.
- Changing the allow-list needs an API restart. Removing someone from it does not revoke tokens they already hold; revoke those with `sumi token revoke`.
- A web UI for managing tokens is not built; use the CLI.
