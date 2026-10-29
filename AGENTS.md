# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Keep this file short.

## What this is

Sumi is a minimal, multi-user ticket management system (Trello/Linear-like), **agent-first**: the MCP server and CLI are primary interfaces, the Vue Kanban board is the human view. Small team, open source, easy to install. Do not add features that are not needed yet.

## Stack

TypeScript everywhere, pnpm monorepo, MongoDB, Hono HTTP API, Vue 3 (Vite) web, GitHub OAuth. Rationale lives in `docs/adr/`.

## Where to look

- `docs/README.md`: index of all docs
- `docs/architecture.md`: package map and boundaries
- `docs/domain.md`: entities, statuses, invariants
- `docs/design.md`: web UI palette, font and component rules (read before touching `packages/web`)
- `docs/adr/`: decisions and why
- `docs/guides/`: how-tos (adding an operation, testing)
- `docs/roadmap.md`: milestones and current status

## Commands

```sh
pnpm install
pnpm dev          # db + api + web in one terminal (needs a token, see below)
pnpm dev:db       # local MongoDB (replica set) via docker compose
pnpm dev:api      # API on :3000 (run `pnpm bootstrap <name>` once for a token)
pnpm dev:web      # Kanban board on :5173 (proxies /api to the API)
pnpm exec sumi --help   # the CLI (needs SUMI_TOKEN, see .env.example)
pnpm exec sumi-mcp      # the MCP server on stdio (same env)
pnpm lint
pnpm typecheck
pnpm test         # needs `pnpm dev:db` running (core tests use a real MongoDB)
```

Node 22.12+ is required (`.nvmrc`).

Definition of done: `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass.

## Rules

1. **All business logic lives in `packages/core`.** `api` wraps it. `client`, `cli`, `mcp` and `web` talk to the API over HTTP only and never import `core` or the database driver.
2. **One contract.** Request/response types are zod schemas in `packages/contract`. Never redefine them by hand in a client.
3. **ADRs are append-only.** Never edit an accepted ADR. Supersede it with a new one that links back. Write an ADR when adding a dependency, changing a package boundary, or making a choice someone could reasonably question later.
4. **Docs change with code.** If a change contradicts `architecture.md`, `domain.md` or an ADR, update or supersede it in the same change. Stale docs are worse than none.
5. **Every mutation is attributed** to a user (human or agent) and recorded in the activity log.
6. **Agent-friendly output.** CLI commands support `--json`. MCP tools are few, clearly described, and return concise responses.
7. **Prefer enforceable rules over prose.** If a rule can be a lint rule, type, or test, make it one.
8. **Keep it minimal.** No speculative features, options, or abstractions.

## Conventions

- Ticket keys look like `SUMI-12` (project key + number).
- Commits: short, imperative, one logical change.
- Package-specific rules go in `packages/<name>/AGENTS.md`, only when needed.
