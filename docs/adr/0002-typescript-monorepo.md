# 2. TypeScript pnpm monorepo

- Status: accepted
- Date: 2026-10-29

## Context

The system has an API, CLI, MCP server and web app that must share types.

## Decision

One pnpm workspace in TypeScript, with packages for contract, core, api, cli, mcp and web.

## Consequences

Shared types are easy and one language covers everything. Package boundaries must be enforced (see architecture.md).
