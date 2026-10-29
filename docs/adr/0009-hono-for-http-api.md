# 9. Hono for the HTTP API

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0004](0004-http-as-the-only-transport.md) makes the HTTP API the only transport. We need a Node framework for it. Candidates were Express, Fastify and Hono. The contract is already zod schemas in `packages/contract`, and the API should stay a thin wrapper over `core`.

## Decision

Use Hono, with `@hono/zod-validator` and the contract schemas for request validation, and Hono's built-in streaming helpers for SSE.

## Consequences

- Types flow from the contract schemas into route handlers with little glue.
- Handlers use web-standard `Request`/`Response`, so the API is not tied to Node.
- The ecosystem is smaller than Express or Fastify. OAuth and session handling may need a little more hand-written code.
