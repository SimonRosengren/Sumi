# Architecture

## Packages

```
packages/
  contract/  zod schemas for requests, responses, events (shared types)
  core/      domain model, services, Mongo repositories (all business logic)
  api/       HTTP server: auth, routes, SSE. Wraps core.
  client/    typed HTTP client of the API, shared by cli, mcp and web
  cli/       commands (--json), built on client
  mcp/       MCP server (stdio), built on client
  web/       Vue 3 Kanban board, built on client
```

Packages are created as their milestone starts; see [roadmap.md](roadmap.md). `contract`, `core`, `api`, `client`, `cli`, `mcp` and `web` exist today.

Internal packages export TypeScript source and have no build step ([ADR 0011](adr/0011-internal-packages-export-typescript-source.md)).

## core layout

`createCore({ uri, dbName })` returns `{ users, projects, tickets, tokens, activity }` services. One file per service in `packages/core/src`. Services take the acting user id as the first argument of every mutation, validate input with the contract schemas, and throw `NotFoundError`, `ConflictError` or `ValidationError` (all extend `SumiError`), which `api` maps to HTTP statuses. Mutations run in a transaction together with their activity entry ([ADR 0012](adr/0012-mongo-transactions-for-mutations.md)).

## api layout

`createApp(core)` in `packages/api/src/app.ts` returns the Hono app; the route list lives there and is exercised in `packages/api/test/api.test.ts`. `src/server.ts` serves it, `src/bootstrap.ts` creates the first human and token, `src/test-server.ts` starts it on a throwaway database for black-box client tests. Routes validate input with the contract schemas, take the acting user from the bearer token and pass it to core. Every error response is `{ error: { code, message } }` ([ErrorResponseSchema](../packages/contract/src/responses.ts)); `SumiError` codes map to 400/403/404/409, anything else is a 500 with a generic message. `GET /health` is the only unauthenticated route.

## cli layout

`run(argv, { env, stdout, stderr })` in `packages/cli/src/cli.ts` defines every command and returns the exit code; `main.ts` is the thin entry (`pnpm exec sumi`). `client.ts` is the typed HTTP client (responses parsed with contract schemas), `format.ts` the text output. Design choices are in [ADR 0015](adr/0015-cli-design.md). Run `pnpm exec sumi --help` for the command list.

## mcp layout

`createServer(client)` in `packages/mcp/src/server.ts` registers the tools and returns an `McpServer`; `main.ts` connects it to stdio. The tool list, response shape and what is deliberately not exposed are in [ADR 0016](adr/0016-mcp-server-and-shared-client.md). Tool descriptions are what the agent reads, so keep them short and accurate.

## web layout

`packages/web/src`: `App.vue` (session: login or board), `views/` (`LoginView`, `BoardView`), `components/` (ours) and `components/ui/` (generated shadcn-vue, do not edit), `composables/useBoard.ts` (the board's state), `lib/` (session, theme, pure board helpers). The browser talks to `/api`, which the dev server proxies to the API. Stack in [ADR 0017](adr/0017-web-stack.md), look and rules in [design.md](design.md).

## Dependency rules

```
contract  <-  core  <-  api
contract  <-  client  <-  cli | mcp | web
```

- `core` depends on `contract` and the Mongo driver only.
- `api` is the only package that imports `core`. It is built with Hono ([ADR 0009](adr/0009-hono-for-http-api.md)).
- `client`, `cli`, `mcp`, `web` never import `core` or the database driver and reach everything through HTTP. `cli`, `mcp` and `web` share `client`.
- These rules are enforced by `no-restricted-imports` in `eslint.config.js` (`pnpm lint`).

## Data flow

Client (CLI / MCP / web) -> HTTP API (auth, validation via contract) -> core service -> MongoDB.
Live updates: core writes -> Mongo change stream -> API -> SSE -> web (and any agent that subscribes).

## Auth

- All clients: `Authorization: Bearer <token>`, one token per user ([ADR 0013](adr/0013-api-token-authentication.md)). Agents are users with `kind: agent`, created by a human, so the activity log can attribute actions.
- Humans in the browser: today they paste an API token on the login screen (kept in `localStorage`). GitHub OAuth with a session cookie is planned and will replace this.
