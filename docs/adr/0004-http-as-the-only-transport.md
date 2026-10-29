# 4. HTTP API is the only transport

- Status: accepted
- Date: 2026-10-29

## Context

Multiple clients (CLI, MCP, web) must work for a team now and for a remote deployment later.

## Decision

The API package is the only one that talks to core and the database. The CLI, MCP server and web app are HTTP clients, with types shared via packages/contract.

## Consequences

Works unchanged locally and remotely. Clients need a running API. There is one place for auth and validation.
