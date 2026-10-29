# Sumi

A slimmed-down ticket management system, designed for agentic workflows first. Agents get an MCP server and a CLI; humans get a Kanban board.

Status: early development. See [docs/roadmap.md](docs/roadmap.md).

## Requirements

- Node.js 22.12+
- pnpm
- Docker (for the local MongoDB)

## Getting started

```sh
pnpm install
pnpm dev:db        # starts MongoDB (single-node replica set) via docker compose
cp .env.example .env
pnpm bootstrap <your-name>   # creates the first user and prints an API token (shown once)
pnpm dev:api                 # API on http://localhost:3000
```

Put the token in `.env` as `SUMI_TOKEN` (or export it), then use the CLI:

```sh
pnpm exec sumi whoami
pnpm exec sumi project create SUMI "Sumi"
pnpm exec sumi ticket create SUMI "My first ticket" --status todo
pnpm exec sumi ticket list SUMI
pnpm exec sumi --help        # all commands; add --json for machine-readable output
```

## Use it from an agent (MCP)

The MCP server speaks stdio and reads the same `SUMI_TOKEN` / `SUMI_URL`. Give each agent its own token (`pnpm exec sumi agent create <name>`) so the activity log shows who did what. Replace `/path/to/sumi` with this checkout.

opencode (`opencode.json`):

```json
{
  "mcp": {
    "sumi": {
      "type": "local",
      "command": ["pnpm", "--dir", "/path/to/sumi", "exec", "sumi-mcp"],
      "environment": { "SUMI_TOKEN": "<agent token>", "SUMI_URL": "http://localhost:3000" }
    }
  }
}
```

Claude Code:

```sh
claude mcp add sumi -e SUMI_TOKEN=<agent token> -- pnpm --dir /path/to/sumi exec sumi-mcp
```

Tools: `whoami`, `list_projects`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `claim_next_ticket`.

## Contributing (humans and agents)

Read [AGENTS.md](AGENTS.md) first. Architecture and decisions live in [docs/](docs/README.md).

## License

MIT
