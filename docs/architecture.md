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

Packages are created as their milestone starts; see [roadmap.md](roadmap.md). `contract` and `core` exist today.

Internal packages export TypeScript source and have no build step ([ADR 0011](adr/0011-internal-packages-export-typescript-source.md)).

## core layout

`createCore({ uri, dbName })` returns `{ users, projects, tickets, activity }` services. One file per service in `packages/core/src`. Services take the acting user id as the first argument of every mutation, validate input with the contract schemas, and throw `NotFoundError`, `ConflictError` or `ValidationError` (all extend `SumiError`), which `api` maps to HTTP statuses. Mutations run in a transaction together with their activity entry ([ADR 0012](adr/0012-mongo-transactions-for-mutations.md)).

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

- Humans: GitHub OAuth, session cookie.
- Agents: API tokens. Each token belongs to an agent user so the activity log can attribute actions.
