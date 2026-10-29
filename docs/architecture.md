# Architecture

## Packages

```
packages/
  contract/  zod schemas for requests, responses, events (shared types)
  core/      domain model, services, Mongo repositories (all business logic)
  api/       HTTP server: auth, routes, SSE. Wraps core.
  cli/       HTTP client + commands (--json)
  mcp/       MCP server, HTTP client of the API
  web/       Vue 3 Kanban board, HTTP client of the API
```

Packages are created as their milestone starts; see [roadmap.md](roadmap.md). `contract`, `core`, `api` and `cli` exist today.

Internal packages export TypeScript source and have no build step ([ADR 0011](adr/0011-internal-packages-export-typescript-source.md)).

## core layout

`createCore({ uri, dbName })` returns `{ users, projects, tickets, activity }` services. One file per service in `packages/core/src`. Services take the acting user id as the first argument of every mutation, validate input with the contract schemas, and throw `NotFoundError`, `ConflictError` or `ValidationError` (all extend `SumiError`), which `api` maps to HTTP statuses. Mutations run in a transaction together with their activity entry ([ADR 0012](adr/0012-mongo-transactions-for-mutations.md)).

## api layout

`createApp(core)` in `packages/api/src/app.ts` returns the Hono app; the route list lives there and is exercised in `packages/api/test/api.test.ts`. `src/server.ts` serves it, `src/bootstrap.ts` creates the first human and token, `src/test-server.ts` starts it on a throwaway database for black-box client tests. Routes validate input with the contract schemas, take the acting user from the bearer token and pass it to core. Every error response is `{ error: { code, message } }` ([ErrorResponseSchema](../packages/contract/src/responses.ts)); `SumiError` codes map to 400/403/404/409, anything else is a 500 with a generic message. `GET /health` is the only unauthenticated route.

## cli layout

`run(argv, { env, stdout, stderr })` in `packages/cli/src/cli.ts` defines every command and returns the exit code; `main.ts` is the thin entry (`pnpm exec sumi`). `client.ts` is the typed HTTP client (responses parsed with contract schemas), `format.ts` the text output. Design choices are in [ADR 0015](adr/0015-cli-design.md). Run `pnpm exec sumi --help` for the command list.

## Dependency rules

```
contract  <-  core  <-  api
contract  <-  cli | mcp | web
```

- `core` depends on `contract` and the Mongo driver only.
- `api` is the only package that imports `core`. It is built with Hono ([ADR 0009](adr/0009-hono-for-http-api.md)).
- `cli`, `mcp`, `web` depend on `contract` only and reach everything through HTTP.
- These rules are enforced by `no-restricted-imports` in `eslint.config.js` (`pnpm lint`).

## Data flow

Client (CLI / MCP / web) -> HTTP API (auth, validation via contract) -> core service -> MongoDB.
Live updates: core writes -> Mongo change stream -> API -> SSE -> web (and any agent that subscribes).

## Auth

- All clients: `Authorization: Bearer <token>`, one token per user ([ADR 0013](adr/0013-api-token-authentication.md)). Agents are users with `kind: agent`, created by a human, so the activity log can attribute actions.
- Humans in the browser: GitHub OAuth with a session cookie (planned, not built yet).
