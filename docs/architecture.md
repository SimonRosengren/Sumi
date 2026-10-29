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

Packages are created as their milestone starts; see [roadmap.md](roadmap.md).

## Dependency rules

```
contract  <-  core  <-  api
contract  <-  cli | mcp | web
```

- `core` depends on `contract` and the Mongo driver only.
- `api` is the only package that imports `core`.
- `cli`, `mcp`, `web` depend on `contract` only and reach everything through HTTP.

## Data flow

Client (CLI / MCP / web) -> HTTP API (auth, validation via contract) -> core service -> MongoDB.
Live updates: core writes -> Mongo change stream -> API -> SSE -> web (and any agent that subscribes).

## Auth

- Humans: GitHub OAuth, session cookie.
- Agents: API tokens. Each token belongs to an agent user so the activity log can attribute actions.
