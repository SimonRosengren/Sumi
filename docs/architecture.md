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

`createCore({ uri, dbName })` returns `{ users, projects, tickets, comments, tokens, activity }` services. One file per service in `packages/core/src`. Services take the acting user id as the first argument of every mutation, validate input with the contract schemas, and throw `NotFoundError`, `ConflictError` or `ValidationError` (all extend `SumiError`), which `api` maps to HTTP statuses. Mutations run in a transaction together with their activity entry ([ADR 0012](adr/0012-mongo-transactions-for-mutations.md)). `createCore` first runs pending database migrations (`src/migrations.ts`, [ADR 0032](adr/0032-versioned-migrations-on-start.md)), which also create the indexes.

## api layout

`createApp(core)` in `packages/api/src/app.ts` returns the Hono app; the route list lives there and is exercised in `packages/api/test/api.test.ts`. `src/server.ts` serves it, `src/bootstrap.ts` creates the first human and token, `src/test-server.ts` starts it on a throwaway database for black-box client tests. Routes validate input with the contract schemas, take the acting user from the bearer token and pass it to core. Every error response is `{ error: { code, message } }` ([ErrorResponseSchema](../packages/contract/src/responses.ts)); `SumiError` codes map to 400/403/404/409, anything else is a 500 with a generic message. Unauthenticated routes: `GET /health`, `GET /auth/config`, the GitHub sign-in routes (`/auth/github*`, [ADR 0021](adr/0021-github-sign-in-and-token-management.md)) and the signature-checked `POST /webhooks/github` ([ADR 0022](adr/0022-github-webhook-moves-tickets.md)). `src/host.ts` wraps the app for deployment (API under `/api`, web app at `/`).

## cli layout

`run(argv, { env, stdout, stderr })` in `packages/cli/src/cli.ts` defines every command and returns the exit code; `main.ts` is the thin entry (`pnpm exec sumi`). `client.ts` is the typed HTTP client (responses parsed with contract schemas), `format.ts` the text output. Design choices are in [ADR 0015](adr/0015-cli-design.md). Run `pnpm exec sumi --help` for the command list.

## client layout

`createClient` in `packages/client/src/client.ts` is the typed HTTP client. `operations.ts` maps each of its methods to the CLI command and MCP tool that expose it, so that everything the web UI can do exists for agents too ([ADR 0029](adr/0029-ui-features-exist-in-cli-and-mcp.md)).

## mcp layout

`createServer(client)` in `packages/mcp/src/server.ts` registers the tools and returns an `McpServer`; `main.ts` connects it to stdio. The tool list, response shape and what is deliberately not exposed are in [ADR 0016](adr/0016-mcp-server-and-shared-client.md). Tool descriptions are what the agent reads, so keep them short and accurate.

## web layout

`packages/web/src`: `App.vue` (session: login or board), `views/` (`LoginView`, `BoardView`), `components/` (ours; `TicketDetail` is the ticket panel, see [ADR 0020](adr/0020-board-interactions.md); `NewTicketDialog` creates tickets, see [ADR 0026](adr/0026-create-and-edit-tickets-in-the-web-ui.md)) and `components/ui/` (generated shadcn-vue, do not edit), `composables/useBoard.ts` (the board's state) and `composables/useViewSettings.ts` (hidden lanes, kept in the browser, see [ADR 0030](adr/0030-view-settings-stay-in-the-browser.md)), `lib/` (session, theme, view settings, pure board helpers, shared form styles). The browser talks to `/api`, which the dev server proxies to the API. Stack in [ADR 0017](adr/0017-web-stack.md), look and rules in [design.md](design.md).

## Dependency rules

```
contract  <-  core  <-  api
contract  <-  client  <-  cli | mcp | web
```

- `core` depends on `contract` and the Mongo driver only.
- `api` is the only package that imports `core`. It is built with Hono ([ADR 0009](adr/0009-hono-for-http-api.md)).
- `client`, `cli`, `mcp`, `web` never import `core` or the database driver and reach everything through HTTP. `cli`, `mcp` and `web` share `client`.
- These rules are enforced by `no-restricted-imports` in `eslint.config.js` (`pnpm lint`).

## Deployment

One container ([ADR 0023](adr/0023-docker-image-and-compose.md)): the API under `/api` and the built web app at `/`, next to MongoDB. In development the API is at `/` and the Vite server proxies `/api` to it. How to run it: [guides/install.md](guides/install.md).

## Data flow

Client (CLI / MCP / web) -> HTTP API (auth, validation via contract) -> core service -> MongoDB.
GitHub: a signed webhook (`POST /webhooks/github`) -> `core.github.syncPullRequest` -> tickets move ([ADR 0022](adr/0022-github-webhook-moves-tickets.md)).
Live updates: every mutation writes an activity entry -> Mongo change stream (`core.activity.subscribe`) -> `GET /events` (SSE) -> `client.watch` -> web reloads the board. Details in [ADR 0019](adr/0019-sse-live-updates.md).

## Auth

- All clients: `Authorization: Bearer <token>`, one token per user ([ADR 0013](adr/0013-api-token-authentication.md)). Agents are users with `kind: agent`, created by a human, so the activity log can attribute actions.
- Humans in the browser: "Continue with GitHub" (allow-listed logins) or paste a token. GitHub sign-in ends by issuing an ordinary API token that the web app keeps in `localStorage`, so there is one auth mechanism ([ADR 0021](adr/0021-github-sign-in-and-token-management.md)). Tokens can be listed and revoked.
