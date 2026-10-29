# 16. MCP server over stdio and a shared HTTP client package

- Status: accepted
- Date: 2026-10-29

## Context

The MCP server is the other primary agent interface next to the CLI ([ADR 0004](0004-http-as-the-only-transport.md)). It must reach the API over HTTP only and may depend on `contract` only, but the typed HTTP client written for the CLI is exactly what it needs. Copying it would create two clients to keep in sync.

## Decision

- Add `packages/client` (`@sumi/client`): the typed HTTP client and `ApiError`, with responses validated by the contract schemas. `cli` and `mcp` depend on it; it depends on `contract` only and is covered by the same lint boundaries as the other clients.
- Add `packages/mcp` using the official `@modelcontextprotocol/sdk` over the **stdio** transport, launched as `pnpm exec sumi-mcp`. Configuration is the same as the CLI: `SUMI_TOKEN` and `SUMI_URL`, with the repo's `.env` as a fallback. Nothing but protocol messages is written to stdout.
- Eight tools: `whoami`, `list_projects`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `claim_next_ticket`. Responses are compact JSON with no timestamps or empty fields; lists omit descriptions. API failures are returned as tool errors (`isError`) with the API's message, so the agent can react instead of the call crashing.
- Not exposed: creating projects and agents, and the activity log. These are setup and review tasks for humans (use the CLI); an agent does not need them to do its work. Add a tool when an agent workflow needs it.
- `update_ticket` merges `links` into the current links, like `ticket update` in the CLI.

## Consequences

- One place to change when the API changes; both clients get the same validation and error handling.
- stdio means each agent session starts its own server process with its own token, which fits "one token per agent user". A remote or shared MCP server (HTTP transport) would need a new decision, especially for auth.
- The read-then-write merge of `links` has the same concurrency caveat as in ADR 0015.
